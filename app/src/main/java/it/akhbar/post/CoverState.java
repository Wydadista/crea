package it.akhbar.post;

/** All values are local editor settings; no image bytes are copied into the draft. */
public final class CoverState {
    public String mainUri = "", secondaryUri = "";
    public String category = "NOTIZIE", title = "", keywords = "";
    public float mainZoom = 1f, mainX = 0f, mainY = 0f;
    public float secondaryZoom = 1f, secondaryX = 0f, secondaryY = 0f;
    public float circleX = 830f, circleY = 780f, radius = 170f;
    public float titleMax = 94f;
}
