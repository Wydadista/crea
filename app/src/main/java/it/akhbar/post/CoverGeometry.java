package it.akhbar.post;

/** Shared preview/export geometry, in the 1080 x 1440 design coordinate space. */
public final class CoverGeometry {
    private CoverGeometry() {}
    public static final int WIDTH = 1080, HEIGHT = 1440;
    public static float clamp(float value, float min, float max) {
        return Float.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
    }
    public static final class Crop {
        public final float width, height, left, top, marginX, marginY;
        Crop(float width, float height, float left, float top, float mx, float my) {
            this.width = width; this.height = height; this.left = left; this.top = top;
            this.marginX = mx; this.marginY = my;
        }
    }
    public static Crop crop(int imageWidth, int imageHeight, float x, float y,
            float width, float height, float zoom, float panX, float panY) {
        if (imageWidth <= 0 || imageHeight <= 0 || width <= 0 || height <= 0)
            throw new IllegalArgumentException("Dimensioni immagine non valide");
        float scale = Math.max(width / imageWidth, height / imageHeight) * clamp(zoom, 1, 4);
        float w = imageWidth * scale, h = imageHeight * scale;
        float mx = Math.max(0, (w - width) / 2), my = Math.max(0, (h - height) / 2);
        return new Crop(w, h, x - mx + clamp(panX, -1, 1) * mx,
                y - my + clamp(panY, -1, 1) * my, mx, my);
    }
    public static float pan(float original, float delta, float margin) {
        return margin < 0.1f ? original : clamp(original + delta / margin, -1, 1);
    }
}
