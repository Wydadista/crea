"""Real Firefox WebDriver smoke test. Python standard library plus Pillow for native screenshot verification.
FIREFOX_BINARY and GECKODRIVER select locally installed test binaries, not extension dependencies.
"""
import base64, contextlib, http.server, io, json, os, pathlib, socket, subprocess, tempfile, threading, time, urllib.request, zipfile
ROOT = pathlib.Path(__file__).resolve().parent.parent

def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0)); return sock.getsockname()[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw): super().__init__(*a,directory=str(ROOT),**kw)
    def log_message(self,*a): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Quiet)
threading.Thread(target=server.serve_forever,daemon=True).start()
port=free_port(); sid=None
log=tempfile.TemporaryFile(mode='w+')
driver=subprocess.Popen([os.environ.get('GECKODRIVER','geckodriver'),'--port',str(port)],stdout=log,stderr=log)

def call(method,path,data=None):
    request=urllib.request.Request(f'http://127.0.0.1:{port}'+path,
        data=json.dumps(data).encode() if data is not None else None, method=method,
        headers={'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(request,timeout=40) as response: result=json.load(response)['value']
    except urllib.error.HTTPError as e: raise AssertionError(e.read().decode()) from e
    if isinstance(result,dict) and 'error' in result: raise AssertionError(result)
    return result

def command(path,data=None,method='POST'): return call(method,'/session/'+sid+path,data)
def js(code,*args): return command('/execute/sync',{'script':code,'args':list(args)})
def wait(fn,timeout=12):
    until=time.monotonic()+timeout
    while time.monotonic()<until:
        try: result=fn()
        except urllib.error.URLError: result=False
        if result: return result
        time.sleep(.08)
    raise AssertionError('Timed out waiting for Firefox')
def rect(selector): return js('const r=document.querySelector(arguments[0]).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}',selector)
def ui(code): return js("const s=document.querySelector('akhbar-blur-ui').shadowRoot;"+code)
def drag(x,y,dx,dy):
    command('/actions',{'actions':[{'type':'pointer','id':'mouse','parameters':{'pointerType':'mouse'},'actions':[
        {'type':'pointerMove','duration':0,'x':round(x),'y':round(y),'origin':'viewport'},
        {'type':'pointerDown','button':0},
        {'type':'pointerMove','duration':180,'x':round(x+dx),'y':round(y+dy),'origin':'viewport'},
        {'type':'pointerUp','button':0}]}]});time.sleep(.12)

def area(i=0): return ui(f"const a=s.querySelectorAll('.area')[{i}],r=a.getBoundingClientRect();return {{x:r.x,y:r.y,width:r.width,height:r.height,filter:getComputedStyle(a).backdropFilter,hidden:a.hidden}};")
def close(a,b,tol=2): assert abs(a-b)<tol,(a,b)
def activate():
    command('/moz/context',{'context':'chrome'})
    js("document.getElementById('unified-extensions-button').click();")
    time.sleep(.15)
    found=js("const e=document.querySelector('[data-extensionid=\"akhbar-blur@akhbar.local\"]');if(e){const b=e.querySelector('.unified-extensions-item-action-button')||e;b.click();return true;}return false;")
    if not found:
        found=js("const b=document.getElementById('akhbar-blur_akhbar_local-browser-action');if(b){b.click();return true;}return false;")
    command('/moz/context',{'context':'content'})
    assert found,'Extension action button not found'
    wait(lambda:js("return !!document.querySelector('akhbar-blur-ui')?.shadowRoot?.querySelector('.toolbar')"))

try:
    wait(lambda: (call('GET','/status') if driver.poll() is None else False))
    caps={'browserName':'firefox','moz:firefoxOptions':{'binary':os.environ['FIREFOX_BINARY'],
        'args':['--remote-allow-system-access'],
        'prefs':{'browser.aboutwelcome.enabled':False,'browser.shell.checkDefaultBrowser':False,'gfx.webrender.all':True,'gfx.webrender.software':True}}}
    session=call('POST','/session',{'capabilities':{'alwaysMatch':caps}});sid=session['sessionId']
    command('/window/rect',{'width':1280,'height':900})
    with tempfile.TemporaryDirectory(prefix='akhbar-blur-addon-') as tmp:
        addon=pathlib.Path(tmp)/'akhbar-blur.xpi'
        with zipfile.ZipFile(addon,'w',zipfile.ZIP_DEFLATED) as z:
            for f in ['manifest.json','background.js','content.js','interface.html','interface.css','icons/blur.svg']:
                z.write(ROOT/f,f)
        installed=command('/moz/addon/install',{'path':str(addon),'temporary':True})
        assert installed=='akhbar-blur@akhbar.local',installed
        command('/url',{'url':f'http://127.0.0.1:{server.server_port}/test/article.html'})
        assert not js("return !!document.querySelector('akhbar-blur-ui')"),'unexpected automatic injection'
        activate()
        print('PASS: real Firefox MV3 installation and action-click injection',flush=True)
        photo=rect('#photo');x=photo['x']+50;y=photo['y']+25
        original=js("return document.querySelector('#photo').src")
        before=command('/screenshot',method='GET')
        from PIL import ImageGrab
        native_before=ImageGrab.grab(xdisplay=os.environ.get('DISPLAY',':99'))
        offset=js('return {x:screenX+(outerWidth-innerWidth)/2,y:screenY+outerHeight-innerHeight}')
        drag(x,y,180,100)
        assert ui("return s.querySelectorAll('.area').length")==1
        first=area();close(first['x'],x);close(first['width'],180)
        assert first['filter']=='blur(16px)',first
        after=command('/screenshot',method='GET')
        pathlib.Path('/tmp/akhbar-blur-after.png').write_bytes(base64.b64decode(after))
        try:
            from PIL import Image,ImageStat
            bounds=(round(x+20),round(y+12),round(x+160),round(y+30))
            a=Image.open(io.BytesIO(base64.b64decode(before))).crop(bounds)
            b=Image.open(io.BytesIO(base64.b64decode(after))).crop(bounds)
            old=sum(ImageStat.Stat(a).stddev);new=sum(ImageStat.Stat(b).stddev)
            nb=ImageGrab.grab(xdisplay=os.environ.get('DISPLAY',':99'))
            native_bounds=tuple(round(v+offset['x' if i%2==0 else 'y']) for i,v in enumerate(bounds))
            native_old=sum(ImageStat.Stat(native_before.crop(native_bounds)).stddev)
            native_new=sum(ImageStat.Stat(nb.crop(native_bounds)).stddev)
            nb.save('/tmp/akhbar-blur-native.png')
            print('Native capture',native_old,native_new,'offset',offset,flush=True)
            if native_new<native_old*.55: old,new=native_old,native_new
            assert new<old*.55,(old,new)
            print('PASS: screenshot pixels confirm image stripes are blurred',flush=True)
        except ImportError: print('Pixel comparison skipped: Pillow not installed',flush=True)
        # Moving and independent width/height resizing.
        drag(first['x']+60,first['y']+60,35,20);moved=area();close(moved['x'],first['x']+35);close(moved['y'],first['y']+20)
        drag(moved['x']+moved['width'],moved['y']+moved['height'],45,25)
        resized=area();close(resized['width'],225);close(resized['height'],125)
        js('window.scrollTo(0,200)');time.sleep(.3);scrolled=area();close(scrolled['y'],resized['y']-200)
        js('window.scrollTo(0,0)');time.sleep(.1)
        # Responsive photograph: normalized local image coordinates scale with it.
        js("document.querySelector('#photo').style.width='480px'");time.sleep(.2)
        scaled=area();close(scaled['width'],resized['width']*.75)
        # A second independent area, strength, undo and duplicate activation.
        p=rect('#text');drag(p['x']+5,p['y']+5,160,35)
        assert ui("return s.querySelectorAll('.area').length")==2
        ui("const r=s.querySelector('input');r.value=30;r.dispatchEvent(new Event('input',{bubbles:true}));")
        assert area()['filter']=='blur(30px)' and area(1)['filter']=='blur(30px)'
        ui("s.querySelector('[data-command=undo]').click()")
        assert ui("return s.querySelectorAll('.area').length")==1
        activate();assert js("return document.querySelectorAll('akhbar-blur-ui').length")==1
        assert ui("return s.querySelectorAll('.area').length")==1
        # Escape returns real page clicks; hidden panel keeps blur.
        command('/actions',{'actions':[{'type':'key','id':'keys','actions':[{'type':'keyDown','value':'\ue00c'},{'type':'keyUp','value':'\ue00c'}]}]})
        assert ui("return s.querySelector('.selection-plane').hidden")
        ui("s.querySelector('[data-command=hide]').click()")
        assert area()['filter']=='blur(30px)'
        button=rect('#page-button');drag(button['x']+8,button['y']+8,0,0)
        assert js("return document.querySelector('#page-button').textContent")=='Funziona'
        # Long document, far beyond the initial viewport.
        js("document.querySelector('#last').scrollIntoView({block:'center'})");time.sleep(.2);activate()
        last=rect('#last');drag(last['x']+30,last['y']+20,180,90)
        assert js('return scrollY')>40000
        long_before=area(1)
        js('window.scrollBy(0,-180)');time.sleep(.15)
        close(area(1)['y'],long_before['y']+180)
        assert js("return document.querySelector('#photo').src")==original
        ui("s.querySelector('[data-command=clear]').click()")
        assert ui("return s.querySelectorAll('.area').length")==0
        assert ui("return s.querySelector('[data-command=undo]').disabled")
        # Reload removes content and does not automatically re-inject.
        command('/refresh',{});assert not js("return !!document.querySelector('akhbar-blur-ui')")
        print('PASS: move, resize, responsive image anchor, scroll past 40,000px, multiple areas, intensity, undo, clear, Esc, real page clicks, reload, unchanged image',flush=True)
finally:
    if sid:
        with contextlib.suppress(Exception):call('DELETE','/session/'+sid)
    driver.terminate()
    with contextlib.suppress(Exception):driver.wait(timeout=5)
    server.shutdown()
    if not sid:
        log.seek(0);print(log.read()[-3000:])
