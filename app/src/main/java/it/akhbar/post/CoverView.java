package it.akhbar.post;

import android.content.Context;
import android.graphics.*;
import android.os.Build;
import android.text.*;
import android.text.style.ForegroundColorSpan;
import android.view.*;

/** One native Canvas renderer drives both the preview and the exported PNG. */
public final class CoverView extends View {
    public static final int MAIN = 0, SECONDARY = 1, CIRCLE = 2;
    private final CoverState state;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final TextPaint text = new TextPaint(Paint.ANTI_ALIAS_FLAG);
    private final TextPaint label = new TextPaint(Paint.ANTI_ALIAS_FLAG);
    private Bitmap main, secondary;
    private int mode = MAIN;
    private float lastX, lastY;
    private final ScaleGestureDetector pinch;
    private Runnable onChange;
    private StaticLayout titleLayout;
    private float labelTop, actualCircleX, actualCircleY;
    private boolean titleFits = true;
    private String cachedTitle, cachedKeywords;
    private float cachedMax;

    public CoverView(Context context, CoverState state) {
        super(context); this.state = state;
        setLayerType(View.LAYER_TYPE_SOFTWARE, null);
        setContentDescription("Anteprima copertina: trascina la foto o usa due dita per ingrandire");
        pinch = new ScaleGestureDetector(context, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override public boolean onScale(ScaleGestureDetector detector) {
                float factor = detector.getScaleFactor();
                if (mode == MAIN) state.mainZoom = CoverGeometry.clamp(state.mainZoom * factor, 1, 4);
                else if (mode == SECONDARY) state.secondaryZoom = CoverGeometry.clamp(state.secondaryZoom * factor, 1, 4);
                else state.radius = CoverGeometry.clamp(state.radius * factor, 100, 230);
                notifyChange(); return true;
            }
        });
    }
    public void setOnChange(Runnable action) { onChange = action; }
    public void setMode(int mode) { this.mode = mode; }
    public void setPhoto(boolean isMain, Bitmap image) {
        if (isMain) main = image; else secondary = image;
        invalidate();
    }
    public boolean hasPhotos() { return main != null && secondary != null; }
    public boolean titleFits() { prepareTitle(); return titleFits; }
    public void refresh() { invalidate(); }
    private void notifyChange() { invalidate(); if (onChange != null) onChange.run(); }
    @Override protected void onMeasure(int widthSpec, int heightSpec) {
        int width = MeasureSpec.getSize(widthSpec);
        setMeasuredDimension(width, Math.round(width * 4f / 3f));
    }
    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        canvas.save(); canvas.scale(getWidth() / 1080f, getWidth() / 1080f);
        drawCover(canvas, false); canvas.restore();
    }
    private Typeface heavy() {
        Typeface base = Typeface.create("sans-serif-condensed", Typeface.BOLD);
        return Build.VERSION.SDK_INT >= 28 ? Typeface.create(base, 900, false) : base;
    }
    private void prepareTitle() {
        if (state.title.equals(cachedTitle) && state.keywords.equals(cachedKeywords) && state.titleMax == cachedMax) return;
        cachedTitle = state.title; cachedKeywords = state.keywords; cachedMax = state.titleMax;
        String value = state.title.isEmpty() ? "Il titolo della tua notizia" : state.title;
        SpannableString styled = new SpannableString(value);
        for (int[] range : CoverTextRules.highlights(value, state.keywords))
            styled.setSpan(new ForegroundColorSpan(0xFFFFD62E), range[0], range[1], Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        text.setTypeface(heavy()); text.setColor(Color.WHITE);
        titleFits = false;
        for (float size = state.titleMax; size >= 42; size -= 2) {
            text.setTextSize(size);
            titleLayout = StaticLayout.Builder.obtain(styled, 0, styled.length(), text, 924)
                    .setAlignment(Layout.Alignment.ALIGN_NORMAL)
                    .setTextDirection(TextDirectionHeuristics.LTR)
                    .setIncludePad(false).setLineSpacing(0, 0.98f)
                    .setBreakStrategy(Layout.BREAK_STRATEGY_SIMPLE)
                    .setHyphenationFrequency(Layout.HYPHENATION_FREQUENCY_NONE).build();
            if (titleLayout.getLineCount() <= 4 && titleLayout.getHeight() <= 460) { titleFits = true; break; }
        }
        labelTop = 1368 - titleLayout.getHeight() - 82;
    }
    private void photo(Canvas canvas, Bitmap bitmap, RectF box, float zoom, float x, float y) {
        if (bitmap == null) {
            paint.setShader(null); paint.setColor(0xFF293542); canvas.drawRect(box, paint); return;
        }
        CoverGeometry.Crop c = CoverGeometry.crop(bitmap.getWidth(), bitmap.getHeight(), box.left, box.top,
                box.width(), box.height(), zoom, x, y);
        canvas.save(); canvas.clipRect(box);
        paint.setShader(null); paint.setColor(Color.WHITE);
        canvas.drawBitmap(bitmap, null, new RectF(c.left, c.top, c.left + c.width, c.top + c.height), paint);
        canvas.restore();
    }
    private void drawCover(Canvas canvas, boolean exporting) {
        prepareTitle();
        canvas.drawColor(0xFF111820);
        photo(canvas, main, new RectF(0, 0, 1080, 1440), state.mainZoom, state.mainX, state.mainY);
        paint.setShader(new LinearGradient(0, 550, 0, 1440,
                new int[]{0x00000000, 0x40000000, 0xE9000000, 0xFC000000},
                new float[]{0, 0.36f, 0.74f, 1}, Shader.TileMode.CLAMP));
        canvas.drawRect(0, 0, 1080, 1440, paint); paint.setShader(null);
        // Keep the secondary photo above the title/category: it can never cover their lettering.
        float r = state.radius;
        actualCircleX = CoverGeometry.clamp(state.circleX, r + 28, 1080 - r - 28);
        actualCircleY = CoverGeometry.clamp(state.circleY, r + 28, Math.max(r + 28, labelTop - r - 24));
        if (secondary != null || !exporting) {
            paint.setShader(null); paint.setColor(0xFF202832);
            paint.setShadowLayer(18, 0, 7, 0x99000000);
            canvas.drawCircle(actualCircleX, actualCircleY, r + 5, paint);
            paint.clearShadowLayer();
            canvas.save(); Path circle = new Path(); circle.addCircle(actualCircleX, actualCircleY, r, Path.Direction.CW);
            canvas.clipPath(circle);
            photo(canvas, secondary, new RectF(actualCircleX - r, actualCircleY - r, actualCircleX + r, actualCircleY + r),
                    state.secondaryZoom, state.secondaryX, state.secondaryY);
            canvas.restore();
            paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(10); paint.setColor(Color.WHITE);
            canvas.drawCircle(actualCircleX, actualCircleY, r, paint); paint.setStyle(Paint.Style.FILL);
        }
        float titleTop = 1368 - titleLayout.getHeight();
        paint.setColor(0xFFE7313F); canvas.drawRect(54, labelTop, 61, 1372, paint);
        label.setTypeface(Typeface.create("sans-serif", Typeface.BOLD)); label.setTextSize(30);
        String category = state.category.isEmpty() ? "CATEGORIA" : state.category;
        while (label.measureText(category) > 862 && label.getTextSize() > 16) label.setTextSize(label.getTextSize() - 1);
        float labelWidth = Math.min(910, label.measureText(category) + 44);
        paint.setColor(0xFFE7313F); canvas.drawRect(88, labelTop, 88 + labelWidth, labelTop + 54, paint);
        label.setColor(Color.WHITE); canvas.drawText(category, 110, labelTop + 36, label);
        canvas.save(); canvas.translate(88, titleTop); titleLayout.draw(canvas); canvas.restore();
    }
    public Bitmap exportBitmap() {
        prepareTitle();
        if (!hasPhotos() || !titleFits || state.title.trim().isEmpty() || state.category.trim().isEmpty())
            throw new IllegalStateException("Scegli le due foto e completa categoria e titolo (massimo 4 righe).");
        Bitmap result = Bitmap.createBitmap(1080, 1440, Bitmap.Config.ARGB_8888);
        drawCover(new Canvas(result), true); return result;
    }
    @Override public boolean onTouchEvent(MotionEvent e) {
        pinch.onTouchEvent(e);
        if (e.getActionMasked() == MotionEvent.ACTION_POINTER_UP) {
            int remaining = e.getActionIndex() == 0 ? 1 : 0;
            if (remaining < e.getPointerCount()) { lastX = e.getX(remaining); lastY = e.getY(remaining); }
            return true;
        }
        if (e.getActionMasked() == MotionEvent.ACTION_DOWN) {
            getParent().requestDisallowInterceptTouchEvent(true);
            lastX = e.getX(); lastY = e.getY(); return true;
        }
        if (e.getActionMasked() == MotionEvent.ACTION_MOVE) {
            float ratio = 1080f / Math.max(1, getWidth());
            float dx = (e.getX() - lastX) * ratio, dy = (e.getY() - lastY) * ratio;
            if (!pinch.isInProgress() && e.getPointerCount() == 1) {
                if (mode == CIRCLE) {
                    state.circleX = actualCircleX + dx; state.circleY = actualCircleY + dy;
                } else {
                    Bitmap b = mode == MAIN ? main : secondary;
                    if (b != null) {
                        float size = mode == MAIN ? 1080 : state.radius * 2;
                        CoverGeometry.Crop crop = CoverGeometry.crop(b.getWidth(), b.getHeight(), 0, 0, size,
                                mode == MAIN ? 1440 : size, mode == MAIN ? state.mainZoom : state.secondaryZoom,
                                mode == MAIN ? state.mainX : state.secondaryX, mode == MAIN ? state.mainY : state.secondaryY);
                        if (mode == MAIN) { state.mainX = CoverGeometry.pan(state.mainX, dx, crop.marginX); state.mainY = CoverGeometry.pan(state.mainY, dy, crop.marginY); }
                        else { state.secondaryX = CoverGeometry.pan(state.secondaryX, dx, crop.marginX); state.secondaryY = CoverGeometry.pan(state.secondaryY, dy, crop.marginY); }
                    }
                }
                notifyChange();
            }
            lastX = e.getX(); lastY = e.getY(); return true;
        }
        if (e.getActionMasked() == MotionEvent.ACTION_UP || e.getActionMasked() == MotionEvent.ACTION_CANCEL) {
            getParent().requestDisallowInterceptTouchEvent(false); performClick(); return true;
        }
        return true;
    }
    @Override public boolean performClick() { super.performClick(); return true; }
}
