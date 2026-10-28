using System;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Diagnostics;
using System.Windows;
using Microsoft.Win32;

namespace AKPlayer
{
    internal static class Setup
    {
        private const string ProductId = "731501c5-63b4-4ac9-9ef2-3e736a066895";
        private const string ProgId = "AKPlayer.Video";
        private const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\AKPlayer";
        private const string Capabilities = @"Software\AKPlayer\Capabilities";
        private static readonly string InstallDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "AKPlayer");
        private static readonly string DesktopLink = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "AK Player.lnk");
        private static readonly string MenuDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "AK Player");
        private static string ExePath { get { return Path.Combine(InstallDir, "AKPlayer.exe"); } }

        [DllImport("shell32.dll")]
        private static extern void SHChangeNotify(uint eventId, uint flags, IntPtr first, IntPtr second);

        internal static int Install()
        {
            if (MessageBox.Show("Installare AK Player per questo utente?\n\nVerranno aggiunti i collegamenti sul desktop e nel menu Start e la voce Apri con.\n\n" + InstallDir,
                "Installa AK Player", MessageBoxButton.OKCancel, MessageBoxImage.Information) != MessageBoxResult.OK) return 0;
            string source = Assembly.GetExecutingAssembly().Location;
            string sourceConfig = source + ".config";
            if (!File.Exists(sourceConfig)) throw new IOException("Manca AKPlayer.exe.config. Ricrea il programma con CREA_EXE.cmd.");
            string marker = Path.Combine(InstallDir, "install-id.txt");
            if (Directory.Exists(InstallDir) && Directory.GetFileSystemEntries(InstallDir).Length > 0 &&
                (!File.Exists(marker) || File.ReadAllText(marker).Trim() != ProductId))
                throw new IOException("La cartella AKPlayer contiene file di un'altra installazione. Scegli una cartella diversa per quei file prima di riprovare: " + InstallDir);
            Directory.CreateDirectory(InstallDir);
            // Record ownership before copying, so a failed installation can be retried safely.
            File.WriteAllText(marker, ProductId);
            if (!String.Equals(Path.GetFullPath(source), Path.GetFullPath(ExePath), StringComparison.OrdinalIgnoreCase))
            {
                try { File.Copy(source, ExePath, true); File.Copy(sourceConfig, ExePath + ".config", true); }
                catch (IOException) { throw new IOException("Chiudi AK Player prima di installare o aggiornare.\n\n" + InstallDir); }
            }
            string command = Quote(ExePath) + " \"%1\"";
            SetDefault(@"Software\Classes\" + ProgId, "Video - AK Player");
            SetDefault(@"Software\Classes\" + ProgId + @"\DefaultIcon", Quote(ExePath) + ",0");
            SetDefault(@"Software\Classes\" + ProgId + @"\shell\open\command", command);
            SetValue(@"Software\Classes\Applications\AKPlayer.exe", "FriendlyAppName", "AK Player");
            SetDefault(@"Software\Classes\Applications\AKPlayer.exe\DefaultIcon", Quote(ExePath) + ",0");
            SetDefault(@"Software\Classes\Applications\AKPlayer.exe\shell\open\command", command);
            foreach (string extension in new string[] { ".mp4", ".m4v" })
            {
                SetValue(@"Software\Classes\Applications\AKPlayer.exe\SupportedTypes", extension, "");
                SetValue(@"Software\Classes\" + extension + @"\OpenWithProgids", ProgId, "");
                SetValue(Capabilities + @"\FileAssociations", extension, ProgId);
            }
            SetValue(Capabilities, "ApplicationName", "AK Player");
            SetValue(Capabilities, "ApplicationDescription", "Lettore MP4 leggero con velocita regolabile e primo piano.");
            SetValue(Capabilities, "ApplicationIcon", Quote(ExePath) + ",0");
            SetValue(@"Software\RegisteredApplications", "AK Player", Capabilities);

            SetValue(UninstallKey, "DisplayName", "AK Player");
            SetValue(UninstallKey, "DisplayVersion", "1.1.0");
            SetValue(UninstallKey, "Publisher", "AK Player");
            SetValue(UninstallKey, "DisplayIcon", ExePath);
            SetValue(UninstallKey, "InstallLocation", InstallDir);
            SetValue(UninstallKey, "UninstallString", Quote(ExePath) + " --uninstall");
            SetValue(UninstallKey, "InstallDate", DateTime.Today.ToString("yyyyMMdd"));
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(UninstallKey))
            {
                key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                long bytes = new FileInfo(ExePath).Length + new FileInfo(ExePath + ".config").Length;
                key.SetValue("EstimatedSize", (int)Math.Max(1, (bytes + 1023) / 1024), RegistryValueKind.DWord);
            }
            Directory.CreateDirectory(MenuDir);
            CreateShortcut(DesktopLink, "", "Apri AK Player");
            CreateShortcut(Path.Combine(MenuDir, "AK Player.lnk"), "", "Apri AK Player");
            CreateShortcut(Path.Combine(MenuDir, "Disinstalla AK Player.lnk"), "--uninstall", "Disinstalla AK Player");
            SHChangeNotify(0x08000000, 0, IntPtr.Zero, IntPtr.Zero);
            MessageBox.Show("AK Player e installato.\n\nPuoi aprirlo dal desktop o dal menu Start.\nPer i video: tasto destro > Apri con > AK Player.\n\nPer renderlo predefinito, selezionalo in Scegli un'altra app o nelle Impostazioni di Windows.",
                "AK Player", MessageBoxButton.OK, MessageBoxImage.Information);
            return 0;
        }

        internal static int Uninstall()
        {
            if (MessageBox.Show("Disinstallare AK Player?\nI tuoi video non verranno modificati o eliminati.", "AK Player", MessageBoxButton.YesNo,
                MessageBoxImage.Question, MessageBoxResult.No) != MessageBoxResult.Yes) return 0;
            string marker = Path.Combine(InstallDir, "install-id.txt");
            if (!File.Exists(marker) || File.ReadAllText(marker).Trim() != ProductId)
                throw new IOException("Installazione non riconosciuta. Nessun file e stato eliminato.");
            foreach (Process other in Process.GetProcessesByName("AKPlayer"))
            {
                using (other)
                {
                    if (other.Id == Process.GetCurrentProcess().Id) continue;
                    try
                    {
                        if (String.Equals(other.MainModule.FileName, ExePath, StringComparison.OrdinalIgnoreCase))
                            throw new IOException("Chiudi le altre finestre di AK Player prima di disinstallare.");
                    }
                    catch (System.ComponentModel.Win32Exception) { }
                }
            }
            foreach (string extension in new string[] { ".mp4", ".m4v" })
                DeleteValue(@"Software\Classes\" + extension + @"\OpenWithProgids", ProgId);
            DeleteValue(@"Software\RegisteredApplications", "AK Player");
            Registry.CurrentUser.DeleteSubKeyTree(@"Software\Classes\" + ProgId, false);
            Registry.CurrentUser.DeleteSubKeyTree(@"Software\Classes\Applications\AKPlayer.exe", false);
            Registry.CurrentUser.DeleteSubKeyTree(@"Software\AKPlayer", false);
            Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false);
            if (File.Exists(DesktopLink)) File.Delete(DesktopLink);
            foreach (string link in new string[] { "AK Player.lnk", "Disinstalla AK Player.lnk" })
            {
                string file = Path.Combine(MenuDir, link);
                if (File.Exists(file)) File.Delete(file);
            }
            if (Directory.Exists(MenuDir) && Directory.GetFileSystemEntries(MenuDir).Length == 0) Directory.Delete(MenuDir);
            SHChangeNotify(0x08000000, 0, IntPtr.Zero, IntPtr.Zero);
            MessageBox.Show("AK Player e stato disinstallato.\nI file del programma verranno rimossi alla chiusura di questa finestra.",
                "AK Player", MessageBoxButton.OK, MessageBoxImage.Information);
            QueueCleanup();
            return 0;
        }

        private static void QueueCleanup()
        {
            // Delete only our known files, never recursively delete a folder containing user files.
            string script = Path.Combine(Path.GetTempPath(), "akplayer-remove-" + Guid.NewGuid().ToString("N") + ".cmd");
            string exe = ExePath.Replace("%", "%%"), dir = InstallDir.Replace("%", "%%");
            string text = "@echo off\r\nchcp 65001 >nul\r\nsetlocal EnableExtensions\r\nset AK_TRIES=0\r\n:wait\r\n" +
                "ping -n 2 127.0.0.1 >nul\r\ndel /q \"" + exe + "\" >nul 2>&1\r\n" +
                "if not exist \"" + exe + "\" goto clean\r\nset /a AK_TRIES+=1 >nul\r\nif %AK_TRIES% LSS 120 goto wait\r\ngoto finish\r\n" +
                ":clean\r\ndel /q \"" + exe + ".config\" \"" + dir + "\\install-id.txt\" >nul 2>&1\r\n" +
                "rd \"" + dir + "\" >nul 2>&1\r\n:finish\r\ndel \"%~f0\"\r\n";
            File.WriteAllText(script, text, new System.Text.UTF8Encoding(false));
            Process.Start(new ProcessStartInfo(Environment.GetEnvironmentVariable("ComSpec") ?? "cmd.exe",
                "/d /c \"\"" + script + "\"\"") { UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden });
        }
        private static string Quote(string value) { return "\"" + value + "\""; }
        private static void SetDefault(string path, string value) { SetValue(path, "", value); }
        private static void SetValue(string path, string name, string value)
        { using (RegistryKey key = Registry.CurrentUser.CreateSubKey(path)) key.SetValue(name, value, RegistryValueKind.String); }
        private static void DeleteValue(string path, string name)
        { using (RegistryKey key = Registry.CurrentUser.OpenSubKey(path, true)) if (key != null) key.DeleteValue(name, false); }
        private static void CreateShortcut(string file, string arguments, string description)
        {
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType == null) throw new IOException("Impossibile creare i collegamenti: Windows Script Host non disponibile.");
            object shell = Activator.CreateInstance(shellType), link = null;
            try
            {
                link = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { file });
                Type t = link.GetType();
                t.InvokeMember("TargetPath", BindingFlags.SetProperty, null, link, new object[] { ExePath });
                t.InvokeMember("Arguments", BindingFlags.SetProperty, null, link, new object[] { arguments });
                t.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, link, new object[] { InstallDir });
                t.InvokeMember("IconLocation", BindingFlags.SetProperty, null, link, new object[] { ExePath + ",0" });
                t.InvokeMember("Description", BindingFlags.SetProperty, null, link, new object[] { description });
                t.InvokeMember("Save", BindingFlags.InvokeMethod, null, link, null);
            }
            finally
            {
                if (link != null && Marshal.IsComObject(link)) Marshal.ReleaseComObject(link);
                if (Marshal.IsComObject(shell)) Marshal.ReleaseComObject(shell);
            }
        }
    }
}
