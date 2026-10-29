package it.akhbar.post;

import android.app.*;
import android.content.*;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.*;
import android.provider.MediaStore;
import android.text.*;
import android.view.*;
import android.view.inputmethod.InputMethodManager;
import android.widget.*;
import java.io.*;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.*;

public final class MainActivity extends Activity {
    private final CoverState state = new CoverState();
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler ui = new Handler(Looper.getMainLooper());
    private CoverView cover;
    private LinearLayout content;
    private TextView message, adjustment;
    private ProgressBar progress;
    private Button chooseMain, chooseSecondary, save;
    private final Button[] modes = new Button[3];
    private SeekBar zoom, size, fontSize;
    private EditText category, title, keywords;
    private int mode = CoverView.MAIN;
    private boolean busy, syncing;
    private static final int PICK_MAIN = 10, PICK_SECONDARY = 11, SAVE_DOCUMENT = 12;
    private static final int BG = 0xFF111820, PANEL = 0xFF1D2833, TEXT = 0xFFEDF2F6, MUTED = 0xFFA8B6C6, GREEN = 0xFFB6ED70;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved); restoreDraft();
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(BG);
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom()); return insets;
        });
        setContentView(root); root.requestApplyInsets();
        TextView heading = text("Akhbar Post", 24, TEXT); heading.setTypeface(null, 1); heading.setPadding(dp(18), dp(14), dp(18), dp(4)); root.addView(heading);
        TextView sub = text("Copertine news · 3:4 · senza Internet", 12, MUTED); sub.setPadding(dp(18), 0, dp(18), dp(10)); root.addView(sub);
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL); content.setPadding(dp(16), 0, dp(16), dp(24)); scroll.addView(content);
        LinearLayout photos = row();
        chooseMain = button("Foto principale", false); chooseSecondary = button("Foto nel cerchio", false);
        photos.addView(chooseMain, weighted()); photos.addView(chooseSecondary, weighted()); add(photos);
        chooseMain.setOnClickListener(v -> pick(PICK_MAIN)); chooseSecondary.setOnClickListener(v -> pick(PICK_SECONDARY));
        cover = new CoverView(this, state); cover.setOnChange(this::syncSliders);
        LinearLayout.LayoutParams previewParams = new LinearLayout.LayoutParams(-1, -2); previewParams.topMargin = dp(12); content.addView(cover, previewParams);
        TextView hint = text("Trascina nell’anteprima per inquadrare. Usa due dita o i controlli qui sotto.", 12, MUTED); hint.setPadding(0, dp(10), 0, dp(8)); add(hint);
        LinearLayout modeRow = row(); String[] names = {"Foto", "Foto cerchio", "Sposta cerchio"};
        for (int i = 0; i < 3; i++) {
            final int target = i; modes[i] = button(names[i], false); modes[i].setTextSize(11);
            modeRow.addView(modes[i], weighted()); modes[i].setOnClickListener(v -> { mode = target; cover.setMode(mode); syncSliders(); });
        }
        add(modeRow); adjustment = text("", 13, TEXT); add(adjustment);
        zoom = slider(300); zoom.setContentDescription("Ingrandimento della foto selezionata"); add(zoom);
        zoom.setOnSeekBarChangeListener(change(value -> {
            if (mode == CoverView.MAIN) state.mainZoom = 1 + value / 100f;
            else state.secondaryZoom = 1 + value / 100f;
            cover.refresh(); syncSliders();
        }));
        label("Dimensione del cerchio"); size = slider(130); size.setContentDescription("Dimensione del cerchio"); add(size);
        size.setOnSeekBarChangeListener(change(value -> { state.radius = 100 + value; cover.refresh(); }));
        Button reset = button("Ripristina inquadratura selezionata", false); add(reset);
        reset.setOnClickListener(v -> {
            if (mode == CoverView.MAIN) { state.mainZoom = 1; state.mainX = 0; state.mainY = 0; }
            else if (mode == CoverView.SECONDARY) { state.secondaryZoom = 1; state.secondaryX = 0; state.secondaryY = 0; }
            else { state.circleX = 830; state.circleY = 780; state.radius = 170; }
            cover.refresh(); syncSliders();
        });
        TextView safe = text("Il cerchio resta sopra il titolo. Spostalo per lasciare visibile il volto.", 12, MUTED); add(safe);
        category = input("Categoria o paese", state.category, 1, 40);
        title = input("Titolo della notizia", state.title, 4, 260);
        keywords = input("Parole gialle, separate da virgole", state.keywords, 2, 260);
        label("Dimensione massima del titolo · adattamento automatico a 4 righe"); fontSize = slider(58); fontSize.setContentDescription("Dimensione massima del titolo"); add(fontSize);
        fontSize.setProgress(Math.round(state.titleMax - 42));
        fontSize.setOnSeekBarChangeListener(change(value -> { state.titleMax = 42 + value; cover.refresh(); validate(); }));
        TextWatcher watcher = new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
                state.category = category.getText().toString(); state.title = title.getText().toString(); state.keywords = keywords.getText().toString();
                cover.refresh(); validate();
            }
            @Override public void afterTextChanged(Editable e) {}
        };
        category.addTextChangedListener(watcher); title.addTextChangedListener(watcher); keywords.addTextChangedListener(watcher);
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal); progress.setIndeterminate(true); progress.setVisibility(View.GONE); add(progress);
        message = text("Scegli le due foto per cominciare.", 13, MUTED); message.setPadding(0, dp(12), 0, dp(8)); add(message);
        save = button("Salva copertina · PNG 1080 × 1440", true); add(save); save.setOnClickListener(v -> saveCover());
        TextView privacy = text("Le foto restano sul telefono. La bozza si conserva su questo dispositivo. Nessun watermark nel PNG.", 11, MUTED); privacy.setPadding(0, dp(12), 0, 0); add(privacy);
        syncSliders(); validate();
        // Restore sequentially to limit image-decoding memory on small phones.
        String mainUri = state.mainUri, secondaryUri = state.secondaryUri;
        Runnable restoreSecond = () -> { if (!secondaryUri.isEmpty()) loadPhoto(Uri.parse(secondaryUri), false, true, null); };
        if (!mainUri.isEmpty()) loadPhoto(Uri.parse(mainUri), true, true, restoreSecond); else restoreSecond.run();
    }
    private int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private TextView text(String value, int size, int color) { TextView t = new TextView(this); t.setText(value); t.setTextSize(size); t.setTextColor(color); return t; }
    private LinearLayout row() { LinearLayout l = new LinearLayout(this); l.setOrientation(LinearLayout.HORIZONTAL); return l; }
    private LinearLayout.LayoutParams weighted() { LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, -2, 1); p.setMargins(dp(2), dp(3), dp(2), dp(3)); return p; }
    private void add(View view) { content.addView(view, new LinearLayout.LayoutParams(-1, -2)); }
    private void label(String value) { TextView label = text(value, 13, TEXT); label.setPadding(0, dp(12), 0, dp(5)); add(label); }
    private Button button(String name, boolean primary) {
        Button b = new Button(this); b.setText(name); b.setAllCaps(false); b.setTextSize(13); b.setTextColor(primary ? BG : TEXT);
        b.setMinHeight(dp(48)); b.setPadding(dp(8), dp(7), dp(8), dp(7)); b.setBackgroundTintList(ColorStateList.valueOf(primary ? GREEN : PANEL)); return b;
    }
    private EditText input(String name, String value, int lines, int limit) {
        label(name); EditText field = new EditText(this); field.setTextSize(16); field.setTextColor(TEXT); field.setHintTextColor(MUTED); field.setHint(name);
        field.setInputType(android.text.InputType.TYPE_CLASS_TEXT | (lines > 1 ? android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE : android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES));
        field.setSingleLine(lines == 1); field.setMinLines(lines == 4 ? 3 : 1); field.setMaxLines(lines == 1 ? 1 : 6); field.setGravity(Gravity.TOP | Gravity.START);
        field.setFilters(new InputFilter[]{ new InputFilter.LengthFilter(limit) });
        GradientDrawable bg = new GradientDrawable(); bg.setColor(PANEL); bg.setCornerRadius(dp(9)); bg.setStroke(dp(1), 0xFF3B4957); field.setBackground(bg); field.setPadding(dp(12), dp(10), dp(12), dp(10)); field.setText(value); add(field); return field;
    }
    private SeekBar slider(int max) { SeekBar s = new SeekBar(this); s.setMax(max); s.setProgressTintList(ColorStateList.valueOf(GREEN)); s.setThumbTintList(ColorStateList.valueOf(GREEN)); s.setMinimumHeight(dp(44)); return s; }
    private interface Change { void apply(int value); }
    private SeekBar.OnSeekBarChangeListener change(Change action) {
        return new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int value, boolean fromUser) { if (fromUser && !syncing) action.apply(value); }
            @Override public void onStartTrackingTouch(SeekBar s) {}
            @Override public void onStopTrackingTouch(SeekBar s) {}
        };
    }
    private void syncSliders() {
        if (zoom == null) return;
        syncing = true;
        for (int i = 0; i < 3; i++) { modes[i].setBackgroundTintList(ColorStateList.valueOf(i == mode ? GREEN : PANEL)); modes[i].setTextColor(i == mode ? BG : TEXT); }
        float value = mode == CoverView.MAIN ? state.mainZoom : state.secondaryZoom;
        zoom.setEnabled(mode != CoverView.CIRCLE); zoom.setProgress(Math.round((value - 1) * 100));
        adjustment.setText(mode == CoverView.CIRCLE ? "Trascina il cerchio nell’anteprima" : "Ingrandimento: " + Math.round(value * 100) + "%");
        size.setProgress(Math.round(state.radius - 100)); syncing = false;
    }
    private void validate() {
        if (save == null) return;
        boolean fits = cover.titleFits();
        save.setEnabled(!busy && cover.hasPhotos() && fits && !state.title.trim().isEmpty() && !state.category.trim().isEmpty());
        save.setAlpha(save.isEnabled() ? 1f : 0.45f);
        if (!busy) {
            if (!fits) message.setText("Titolo troppo lungo: accorcialo per rimanere entro quattro righe leggibili.");
            else if (!cover.hasPhotos()) message.setText("Scegli la foto principale e quella da inserire nel cerchio.");
            else if (state.title.trim().isEmpty() || state.category.trim().isEmpty()) message.setText("Completa categoria e titolo.");
            else message.setText("Pronto · copertina 3:4, 1080 × 1440 pixel.");
        }
    }
    private void setBusy(boolean value, String status) {
        busy = value; chooseMain.setEnabled(!value); chooseSecondary.setEnabled(!value); progress.setVisibility(value ? View.VISIBLE : View.GONE);
        validate(); if (status != null) message.setText(status);
    }
    private void pick(int request) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT); intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType("image/*");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        try { startActivityForResult(intent, request); } catch (ActivityNotFoundException e) { inform("Nessun selettore di immagini disponibile."); }
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (result != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        if (request == PICK_MAIN || request == PICK_SECONDARY) {
            try { getContentResolver().takePersistableUriPermission(uri, data.getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (SecurityException ignored) {}
            loadPhoto(uri, request == PICK_MAIN, false, null);
        } else if (request == SAVE_DOCUMENT) writeCover(uri, false);
    }
    private void loadPhoto(Uri uri, boolean isMain, boolean restoring, Runnable after) {
        setBusy(true, "Apertura della foto…");
        io.execute(() -> {
            try {
                Bitmap image = ImageLoader.read(getContentResolver(), uri, isMain ? 2560 : 1600);
                ui.post(() -> {
                    if (isDestroyed()) { image.recycle(); return; }
                    cover.setPhoto(isMain, image);
                    if (isMain) { state.mainUri = uri.toString(); if (!restoring) { state.mainX = 0; state.mainY = 0; state.mainZoom = 1; } }
                    else { state.secondaryUri = uri.toString(); if (!restoring) { state.secondaryX = 0; state.secondaryY = 0; state.secondaryZoom = 1; } }
                    persistDraft(); setBusy(false, null); syncSliders(); if (after != null) after.run();
                });
            } catch (IOException | RuntimeException | OutOfMemoryError e) {
                ui.post(() -> { if (isDestroyed()) return; setBusy(false, "Foto non disponibile: selezionala nuovamente, oppure prova un’immagine più piccola."); if (after != null) after.run(); });
            }
        });
    }
    private String filename() { return "Akhbar_" + new SimpleDateFormat("yyyyMMdd_HHmmss_SSS", Locale.ROOT).format(new Date()) + ".png"; }
    private void saveCover() {
        ((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(save.getWindowToken(), 0);
        persistDraft();
        if (Build.VERSION.SDK_INT < 29) {
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/png").putExtra(Intent.EXTRA_TITLE, filename());
            try { startActivityForResult(intent, SAVE_DOCUMENT); } catch (ActivityNotFoundException e) { inform("Nessun selettore di destinazione disponibile."); }
        } else writeCover(null, true);
    }
    private void writeCover(Uri destination, boolean gallery) {
        final Bitmap output;
        try { output = cover.exportBitmap(); } catch (IllegalStateException | OutOfMemoryError e) { inform("Impossibile salvare: verifica le foto e il titolo e riprova."); return; }
        setBusy(true, "Salvataggio della copertina…");
        io.execute(() -> {
            Uri uri = destination;
            try {
                if (gallery) {
                    ContentValues values = new ContentValues(); values.put(MediaStore.Images.Media.DISPLAY_NAME, filename()); values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                    values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Akhbar Post"); values.put(MediaStore.Images.Media.IS_PENDING, 1);
                    uri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                }
                if (uri == null) throw new IOException("Destinazione non disponibile");
                try (OutputStream stream = getContentResolver().openOutputStream(uri, "w")) {
                    if (stream == null || !output.compress(Bitmap.CompressFormat.PNG, 100, stream)) throw new IOException("Salvataggio non riuscito");
                    stream.flush();
                }
                if (gallery) { ContentValues ready = new ContentValues(); ready.put(MediaStore.Images.Media.IS_PENDING, 0); getContentResolver().update(uri, ready, null, null); }
                ui.post(() -> { if (!isDestroyed()) { setBusy(false, gallery ? "Salvata nella galleria · Immagini / Akhbar Post" : "Copertina salvata nella posizione scelta."); inform("Copertina salvata"); } });
            } catch (IOException | RuntimeException e) {
                if (gallery && uri != null) try { getContentResolver().delete(uri, null, null); } catch (RuntimeException ignored) {}
                ui.post(() -> { if (!isDestroyed()) setBusy(false, "Salvataggio non riuscito. Verifica lo spazio libero e riprova."); });
            } finally { output.recycle(); }
        });
    }
    private void inform(String message) { Toast.makeText(this, message, Toast.LENGTH_LONG).show(); }
    private void persistDraft() {
        android.content.SharedPreferences.Editor p = getSharedPreferences("draft", MODE_PRIVATE).edit();
        p.putString("main", state.mainUri).putString("secondary", state.secondaryUri).putString("category", state.category).putString("title", state.title).putString("keywords", state.keywords);
        p.putFloat("mainZoom", state.mainZoom).putFloat("mainX", state.mainX).putFloat("mainY", state.mainY);
        p.putFloat("secondaryZoom", state.secondaryZoom).putFloat("secondaryX", state.secondaryX).putFloat("secondaryY", state.secondaryY);
        p.putFloat("circleX", state.circleX).putFloat("circleY", state.circleY).putFloat("radius", state.radius).putFloat("titleMax", state.titleMax).apply();
    }
    private void restoreDraft() {
        android.content.SharedPreferences p = getSharedPreferences("draft", MODE_PRIVATE);
        state.mainUri = p.getString("main", ""); state.secondaryUri = p.getString("secondary", ""); state.category = p.getString("category", "NOTIZIE"); state.title = p.getString("title", ""); state.keywords = p.getString("keywords", "");
        state.mainZoom = CoverGeometry.clamp(p.getFloat("mainZoom", 1), 1, 4); state.mainX = CoverGeometry.clamp(p.getFloat("mainX", 0), -1, 1); state.mainY = CoverGeometry.clamp(p.getFloat("mainY", 0), -1, 1);
        state.secondaryZoom = CoverGeometry.clamp(p.getFloat("secondaryZoom", 1), 1, 4); state.secondaryX = CoverGeometry.clamp(p.getFloat("secondaryX", 0), -1, 1); state.secondaryY = CoverGeometry.clamp(p.getFloat("secondaryY", 0), -1, 1);
        state.circleX = CoverGeometry.clamp(p.getFloat("circleX", 830), 100, 1000); state.circleY = CoverGeometry.clamp(p.getFloat("circleY", 780), 100, 1300); state.radius = CoverGeometry.clamp(p.getFloat("radius", 170), 100, 230); state.titleMax = CoverGeometry.clamp(p.getFloat("titleMax", 94), 42, 100);
    }
    @Override protected void onPause() { persistDraft(); super.onPause(); }
    @Override protected void onDestroy() { io.shutdown(); super.onDestroy(); }
}
