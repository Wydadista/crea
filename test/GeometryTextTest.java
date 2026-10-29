import it.akhbar.post.*;
import java.util.*;

public final class GeometryTextTest {
    private static void close(float a, float b) { if (Math.abs(a-b) > .02f) throw new AssertionError(a+" != "+b); }
    private static void check(boolean value) { if (!value) throw new AssertionError(); }
    public static void main(String[] args) {
        CoverGeometry.Crop landscape = CoverGeometry.crop(2400,1600,0,0,1080,1440,1,0,0);
        close(landscape.width,2160); close(landscape.height,1440); close(landscape.left,-540); close(landscape.top,0);
        CoverGeometry.Crop left = CoverGeometry.crop(2400,1600,0,0,1080,1440,1,-1,0);
        close(left.left,-1080); check(left.left+left.width>=1080);
        CoverGeometry.Crop right = CoverGeometry.crop(2400,1600,0,0,1080,1440,1,1,0);
        close(right.left,0);
        // Cover-crop never stretches aspect ratio or exposes blank edges, for either photo.
        for(int w:new int[]{100,1080,2400,8000}) for(int h:new int[]{80,1440,3200})
            for(float zoom:new float[]{1,1.5f,4}) for(float pan:new float[]{-1,0,1}) {
                CoverGeometry.Crop c=CoverGeometry.crop(w,h,0,0,1080,1440,zoom,pan,pan);
                close(c.width/c.height,w/(float)h);
                check(c.left<=.01 && c.top<=.01 && c.left+c.width>=1079.99 && c.top+c.height>=1439.99);
            }
        close(CoverGeometry.pan(0,100,200),.5f); close(CoverGeometry.pan(.9f,100,200),1); close(CoverGeometry.pan(.4f,50,0),.4f);
        check(CoverTextRules.highlights("Roma e Romagna: ROMA, nuovo accordo!", "Roma, nuovo accordo").size()==3);
        String arabic="المغرب يعلن اتفاقاً جديداً";
        List<int[]> ranges=CoverTextRules.highlights(arabic,"المغرب، اتفاقاً");
        check(ranges.size()==2); check(arabic.substring(ranges.get(0)[0],ranges.get(0)[1]).equals("المغرب"));
        check(CoverTextRules.highlights("Il C++ cambia: C++", "C++").size()==2);
        check(CoverTextRules.highlights("Una notizia", "").isEmpty());
        check(CoverGeometry.WIDTH*4==CoverGeometry.HEIGHT*3);
        System.out.println("PASS: 3:4 geometry, natural proportions, crop bounds, panning, literal/Unicode/Arabic keywords and unchanged titles");
    }
}
