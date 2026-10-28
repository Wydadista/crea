using System;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Win32;
using System.Reflection;

[assembly: AssemblyTitle("MP4 Leggero")]
[assembly: AssemblyDescription("Lettore video essenziale per Windows")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace MP4Leggero
{
    internal static class Program
    {
        [STAThread]
        public static void Main(string[] args)
        {
            Application app = new Application();
            app.DispatcherUnhandledException += delegate(object sender, DispatcherUnhandledExceptionEventArgs e)
            {
                MessageBox.Show(e.Exception.Message, "MP4 Leggero", MessageBoxButton.OK, MessageBoxImage.Warning);
                e.Handled = true;
            };
            app.Run(new PlayerWindow(args.Length > 0 ? args[0] : null));
        }
    }

    internal sealed class PlayerWindow : Window
    {
        private readonly MediaElement video = new MediaElement();
        private readonly Border controls = new Border();
        private readonly Slider position = new Slider();
        private readonly Slider speed = new Slider();
        private readonly TextBlock clock = new TextBlock();
        private readonly TextBlock speedLabel = new TextBlock();
        private readonly TextBlock message = new TextBlock();
        private readonly Button play = new Button();
        private readonly Button pause = new Button();
        private readonly Button open = new Button();
        private readonly Button pin = new Button();
        private readonly Button fullscreen = new Button();
        private readonly DispatcherTimer timer = new DispatcherTimer();
        private readonly double[] rates = { 0.5, 1, 1.5, 2, 2.5, 3 };
        private bool opened, playing, updating, isFullscreen;
        private WindowState previousState;
        private DateTime lastInteraction = DateTime.UtcNow;
        private readonly string initialFile;
        private string fileName = "";

        internal PlayerWindow(string initial)
        {
            initialFile = initial;
            Title = "MP4 Leggero";
            Width = 800; Height = 490; MinWidth = 170; MinHeight = 140;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            Background = Brushes.Black; Foreground = Brushes.White;
            FontFamily = new FontFamily("Segoe UI");
            Icon = new DrawingImage(new GeometryDrawing(new SolidColorBrush(Color.FromRgb(180,237,112)), null,
                Geometry.Parse("M 2,1 L 18,10 L 2,19 Z")));
            AllowDrop = true;

            Grid surface = new Grid();
            Content = surface;
            video.LoadedBehavior = MediaState.Manual;
            video.UnloadedBehavior = MediaState.Manual;
            video.ScrubbingEnabled = true;
            video.Stretch = Stretch.Uniform;
            video.Volume = 1;
            surface.Children.Add(video);

            message.Text = "Apri un video MP4\noppure trascinalo qui";
            message.FontSize = 16; message.TextAlignment = TextAlignment.Center;
            message.HorizontalAlignment = HorizontalAlignment.Center;
            message.VerticalAlignment = VerticalAlignment.Center;
            message.Margin = new Thickness(16);
            message.IsHitTestVisible = false;
            surface.Children.Add(message);

            controls.Background = new SolidColorBrush(Color.FromArgb(235,22,26,31));
            controls.VerticalAlignment = VerticalAlignment.Bottom;
            controls.Padding = new Thickness(8,4,8,6);
            surface.Children.Add(controls);
            StackPanel rows = new StackPanel(); controls.Child = rows;

            Grid seekRow = new Grid();
            seekRow.ColumnDefinitions.Add(new ColumnDefinition());
            seekRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            position.Minimum = 0; position.Maximum = 1;
            position.IsMoveToPointEnabled = true;
            position.VerticalAlignment = VerticalAlignment.Center;
            position.IsEnabled = false;
            position.ValueChanged += delegate { if (!updating && opened) Seek(position.Value); };
            seekRow.Children.Add(position);
            clock.Text = "00:00 / 00:00"; clock.FontSize = 10;
            clock.VerticalAlignment = VerticalAlignment.Center;
            clock.Margin = new Thickness(6,0,0,0);
            Grid.SetColumn(clock,1); seekRow.Children.Add(clock);
            rows.Children.Add(seekRow);

            Grid buttons = new Grid();
            for (int i=0;i<5;i++) buttons.ColumnDefinitions.Add(new ColumnDefinition());
            Configure(open,"Scegli file","Apri un video (Ctrl+O)",delegate { ChooseFile(); });
            Configure(play,"▶","Riproduci (Spazio)",delegate { Play(); });
            Configure(pause,"⏸","Pausa (Spazio)",delegate { Pause(); });
            Configure(pin,"Primo piano","Mantieni sopra le altre finestre",delegate { Topmost = !Topmost; PaintPin(); });
            Configure(fullscreen,"⛶","Schermo intero (F11); Esc per uscire",delegate { ToggleFullscreen(); });
            Button[] all = {open,play,pause,pin,fullscreen};
            for(int i=0;i<all.Length;i++) { Grid.SetColumn(all[i],i); buttons.Children.Add(all[i]); }
            rows.Children.Add(buttons);

            Grid speedRow = new Grid();
            speedRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            speedRow.ColumnDefinitions.Add(new ColumnDefinition());
            speedLabel.FontSize = 11; speedLabel.Margin = new Thickness(2,2,7,0);
            speedLabel.VerticalAlignment = VerticalAlignment.Center;
            speedRow.Children.Add(speedLabel);
            speed.Minimum=0; speed.Maximum=5; speed.Value=1;
            speed.TickFrequency=1; speed.IsSnapToTickEnabled=true;
            speed.IsMoveToPointEnabled=true; speed.TickPlacement=TickPlacement.BottomRight;
            speed.ValueChanged += delegate { ApplySpeed(); Reveal(); };
            Grid.SetColumn(speed,1); speedRow.Children.Add(speed);
            rows.Children.Add(speedRow);

            UniformGrid speedMarks = new UniformGrid { Columns = 6 };
            for(int i=0;i<rates.Length;i++)
            {
                int index=i;
                Button mark = new Button();
                Configure(mark, RateText(rates[i]), "Velocità " + RateText(rates[i]),delegate { speed.Value=index; ApplySpeed(); });
                mark.FontSize=10; mark.Padding=new Thickness(0); mark.MinHeight=18;
                mark.Background=Brushes.Transparent; mark.BorderThickness=new Thickness(0);
                speedMarks.Children.Add(mark);
            }
            rows.Children.Add(speedMarks);
            ApplySpeed(); PaintPin(); PaintPlayback();

            video.MediaOpened += delegate
            {
                opened=true;
                position.IsEnabled=video.NaturalDuration.HasTimeSpan && video.NaturalDuration.TimeSpan.TotalSeconds>0;
                position.Maximum=position.IsEnabled ? video.NaturalDuration.TimeSpan.TotalSeconds : 1;
                message.Visibility=Visibility.Collapsed;
                ApplySpeed(); PaintPlayback(); UpdateClock();
            };
            video.MediaEnded += delegate { Pause(); video.Position=TimeSpan.Zero; UpdateClock(); };
            video.MediaFailed += delegate(object sender, ExceptionRoutedEventArgs e)
            {
                opened=false; playing=false; position.IsEnabled=false;
                video.Close(); PaintPlayback(); Reveal();
                message.Text="Impossibile riprodurre questo file.\nVerifica che il codec sia supportato da Windows.";
                message.Visibility=Visibility.Visible;
                MessageBox.Show(this,"Il contenitore MP4 può usare codec diversi. Questo lettore usa i codec di Windows.\n\n" +
                    (e.ErrorException == null ? "File non leggibile." : e.ErrorException.Message),
                    "Video non disponibile", MessageBoxButton.OK, MessageBoxImage.Information);
            };
            MouseMove += delegate { Reveal(); };
            PreviewMouseDown += delegate { Reveal(); };
            surface.MouseLeftButtonDown += delegate(object sender, MouseButtonEventArgs e)
            {
                if (controls.IsMouseOver) return;
                if (e.ClickCount==2) ToggleFullscreen();
            };
            PreviewKeyDown += OnKey;
            SizeChanged += delegate
            {
                bool small=ActualWidth<500;
                open.Content=small ? "＋" : "Scegli file";
                clock.Visibility=ActualWidth<330 ? Visibility.Collapsed : Visibility.Visible;
                PaintPin();
            };
            DragOver += delegate(object sender, DragEventArgs e)
            { e.Effects=e.Data.GetDataPresent(DataFormats.FileDrop) ? DragDropEffects.Copy : DragDropEffects.None; e.Handled=true; };
            Drop += delegate(object sender, DragEventArgs e)
            {
                string[] files=e.Data.GetData(DataFormats.FileDrop) as string[];
                if(files!=null && files.Length>0) OpenFile(files[0]);
                e.Handled=true;
            };
            timer.Interval=TimeSpan.FromMilliseconds(200);
            timer.Tick += delegate
            {
                UpdateClock();
                if(playing && opened && !controls.IsMouseOver && !controls.IsKeyboardFocusWithin &&
                    (DateTime.UtcNow-lastInteraction).TotalSeconds>2.5)
                    controls.Visibility=Visibility.Collapsed;
            };
            timer.Start();
            Loaded += delegate { if(!String.IsNullOrEmpty(initialFile)) OpenFile(initialFile); };
            Closed += delegate { timer.Stop(); video.Close(); };
        }

        private void Configure(Button b,string text,string tip,RoutedEventHandler action)
        {
            b.Content=text; b.ToolTip=tip; b.Foreground=Brushes.White;
            b.Background=new SolidColorBrush(Color.FromRgb(42,48,56));
            b.BorderBrush=new SolidColorBrush(Color.FromRgb(65,72,82));
            b.Margin=new Thickness(2); b.Padding=new Thickness(3,4,3,4);
            b.MinHeight=26; b.Click+=action;
            System.Windows.Automation.AutomationProperties.SetName(b,tip);
        }
        private static string RateText(double rate) { return rate.ToString("0.#",System.Globalization.CultureInfo.GetCultureInfo("it-IT"))+"×"; }
        private void ApplySpeed()
        {
            int i=Math.Max(0,Math.Min(5,(int)Math.Round(speed.Value)));
            video.SpeedRatio=rates[i]; speedLabel.Text=RateText(rates[i]);
        }
        private void ChooseFile()
        {
            OpenFileDialog dlg=new OpenFileDialog();
            dlg.Title="Scegli un video";
            dlg.Filter="Video MP4 (*.mp4;*.m4v)|*.mp4;*.m4v|Tutti i file (*.*)|*.*";
            if(dlg.ShowDialog(this)==true) OpenFile(dlg.FileName);
            Reveal();
        }
        private void OpenFile(string file)
        {
            try
            {
                string full=Path.GetFullPath(file);
                if(!File.Exists(full)) throw new FileNotFoundException("Il file non esiste.",full);
                video.Close(); opened=false; playing=true; position.IsEnabled=false;
                updating=true; position.Value=0; updating=false;
                fileName=Path.GetFileName(full); Title="MP4 Leggero · "+fileName;
                message.Text="Apertura del video…"; message.Visibility=Visibility.Visible;
                video.Source=new Uri(full,UriKind.Absolute); video.Play(); ApplySpeed(); Reveal(); PaintPlayback();
                Keyboard.ClearFocus();
            }
            catch(Exception e) { MessageBox.Show(this,e.Message,"Apertura del file",MessageBoxButton.OK,MessageBoxImage.Warning); }
        }
        private void PaintPlayback() { play.IsEnabled=opened && !playing; pause.IsEnabled=opened && playing; }
        private void Play()
        {
            if(!opened) return;
            if(video.NaturalDuration.HasTimeSpan && video.Position>=video.NaturalDuration.TimeSpan) video.Position=TimeSpan.Zero;
            video.Play(); playing=true; ApplySpeed(); PaintPlayback(); Reveal(); Keyboard.ClearFocus();
        }
        private void Pause() { if(!opened) return; video.Pause(); playing=false; PaintPlayback(); Reveal(); }
        private void PaintPin()
        {
            pin.Content=ActualWidth<500 ? (Topmost ? "●" : "○") : (Topmost ? "Primo piano ✓" : "Primo piano");
            pin.Background=Topmost ? new SolidColorBrush(Color.FromRgb(57,94,49)) : new SolidColorBrush(Color.FromRgb(42,48,56));
            pin.ToolTip=Topmost ? "Primo piano attivo: clicca per disattivare" : "Mantieni sopra le altre finestre";
        }
        private void Reveal() { controls.Visibility=Visibility.Visible; lastInteraction=DateTime.UtcNow; }
        private void Seek(double seconds)
        {
            if(!opened || !video.NaturalDuration.HasTimeSpan) return;
            video.Position=TimeSpan.FromSeconds(Math.Max(0,Math.Min(video.NaturalDuration.TimeSpan.TotalSeconds,seconds)));
            UpdateClock(); Reveal();
        }
        private void UpdateClock()
        {
            if(!opened) return;
            double seconds=video.Position.TotalSeconds;
            if(!position.IsMouseCaptureWithin)
            { updating=true; position.Value=Math.Max(0,Math.Min(position.Maximum,seconds)); updating=false; }
            clock.Text=TimeText(video.Position)+" / "+(video.NaturalDuration.HasTimeSpan ? TimeText(video.NaturalDuration.TimeSpan) : "--:--");
        }
        private static string TimeText(TimeSpan value)
        { return value.TotalHours>=1 ? String.Format("{0}:{1:00}:{2:00}",(int)value.TotalHours,value.Minutes,value.Seconds) : String.Format("{0:00}:{1:00}",(int)value.TotalMinutes,value.Seconds); }
        private void ToggleFullscreen()
        {
            if(!isFullscreen)
            {
                previousState=WindowState; WindowState=WindowState.Normal;
                WindowStyle=WindowStyle.None; ResizeMode=ResizeMode.NoResize;
                WindowState=WindowState.Maximized; isFullscreen=true;
            }
            else
            {
                WindowState=WindowState.Normal; WindowStyle=WindowStyle.SingleBorderWindow;
                ResizeMode=ResizeMode.CanResize; WindowState=previousState; isFullscreen=false;
            }
            Reveal();
        }
        private void OnKey(object sender,KeyEventArgs e)
        {
            if(e.Key==Key.O && (Keyboard.Modifiers & ModifierKeys.Control)!=0) { ChooseFile(); e.Handled=true; }
            else if(e.Key==Key.F11) { ToggleFullscreen(); e.Handled=true; }
            else if(e.Key==Key.Escape && isFullscreen) { ToggleFullscreen(); e.Handled=true; }
            else if(e.Key==Key.Space) { if(playing) Pause(); else Play(); e.Handled=true; }
            else if(e.Key==Key.Left && !(Keyboard.FocusedElement is Slider)) { Seek(video.Position.TotalSeconds-5); e.Handled=true; }
            else if(e.Key==Key.Right && !(Keyboard.FocusedElement is Slider)) { Seek(video.Position.TotalSeconds+5); e.Handled=true; }
        }
    }
}
