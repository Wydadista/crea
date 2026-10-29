package it.akhbar.post;

import android.content.ContentResolver;
import android.graphics.*;
import android.media.ExifInterface;
import android.net.Uri;
import java.io.*;

/** Sampled, orientation-aware decoding. Opens only the URI chosen in Android's picker. */
public final class ImageLoader {
    private ImageLoader() {}
    public static Bitmap read(ContentResolver resolver, Uri uri, int maxEdge) throws IOException {
        BitmapFactory.Options info = new BitmapFactory.Options(); info.inJustDecodeBounds = true;
        try (InputStream in = resolver.openInputStream(uri)) { BitmapFactory.decodeStream(in, null, info); }
        if (info.outWidth < 1 || info.outHeight < 1) throw new IOException("Formato immagine non supportato");
        BitmapFactory.Options options = new BitmapFactory.Options(); options.inSampleSize = 1;
        int edge = Math.max(info.outWidth, info.outHeight);
        while (edge / (options.inSampleSize * 2) >= maxEdge) options.inSampleSize *= 2;
        options.inPreferredConfig = Bitmap.Config.ARGB_8888;
        Bitmap image;
        try (InputStream in = resolver.openInputStream(uri)) { image = BitmapFactory.decodeStream(in, null, options); }
        if (image == null) throw new IOException("Impossibile aprire questa immagine");
        int decodedEdge = Math.max(image.getWidth(), image.getHeight());
        if (decodedEdge > maxEdge) {
            float scale = maxEdge / (float) decodedEdge;
            Bitmap smaller = Bitmap.createScaledBitmap(image, Math.max(1, Math.round(image.getWidth() * scale)),
                    Math.max(1, Math.round(image.getHeight() * scale)), true);
            if (smaller != image) { image.recycle(); image = smaller; }
        }
        int orientation = ExifInterface.ORIENTATION_NORMAL;
        try (InputStream in = resolver.openInputStream(uri)) {
            if (in != null) orientation = new ExifInterface(in).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
        } catch (IOException | RuntimeException ignored) { /* PNG and other formats may have no EXIF. */ }
        Matrix transform = new Matrix();
        switch (orientation) {
            case ExifInterface.ORIENTATION_FLIP_HORIZONTAL: transform.setScale(-1, 1); break;
            case ExifInterface.ORIENTATION_ROTATE_180: transform.setRotate(180); break;
            case ExifInterface.ORIENTATION_FLIP_VERTICAL: transform.setScale(1, -1); break;
            case ExifInterface.ORIENTATION_TRANSPOSE: transform.setRotate(90); transform.postScale(-1, 1); break;
            case ExifInterface.ORIENTATION_ROTATE_90: transform.setRotate(90); break;
            case ExifInterface.ORIENTATION_TRANSVERSE: transform.setRotate(270); transform.postScale(-1, 1); break;
            case ExifInterface.ORIENTATION_ROTATE_270: transform.setRotate(270); break;
            default: break;
        }
        if (!transform.isIdentity()) {
            Bitmap corrected = Bitmap.createBitmap(image, 0, 0, image.getWidth(), image.getHeight(), transform, true);
            if (corrected != image) { image.recycle(); image = corrected; }
        }
        return image;
    }
}
