"""Render actual-size/overlay QA and validate the shipped 2.1 pet-art contract."""
from pathlib import Path
from PIL import Image, ImageDraw
import json
import hashlib
import math

ROOT=Path(__file__).resolve().parents[1]/'public/pet-art/v21'
QA=ROOT/'qa'
PETS=('cat','chick','bunny','bear','fox')
ACCESSORIES=json.loads((ROOT/'accessories/manifest.json').read_text())['items']


def overlay(sprite,frame,name):
    if name=='none': return sprite
    item=ACCESSORIES[name]
    placement=frame['accessoryAnchors']
    point=placement[item['target']]
    variant=item['variants'][placement['orientation']]
    graphic=Image.open(ROOT/'accessories'/variant['image'])
    width=round(point['width']*256*item['widthMultiplier'])
    graphic=graphic.resize((width,width),Image.Resampling.NEAREST)
    center=(point['x']*256,point['y']*256)
    x=round(center[0]-width*item['anchor']['x'])
    y=round(center[1]-width*item['anchor']['y'])
    layer=Image.new('RGBA',(256,256))
    layer.alpha_composite(graphic,(x,y))
    layer=layer.rotate(-placement.get('rotationDegrees',0),resample=Image.Resampling.NEAREST,center=center)
    if point.get('layer')=='behind':
        result=layer
        result.alpha_composite(sprite)
    else:
        result=sprite.copy()
        result.alpha_composite(layer)
    return result


def main():
    QA.mkdir(exist_ok=True)
    report={'version':2,'pets':{},'scope':'PNG alpha, frame rectangles, clip coverage, independent pixels, actual-size identity and rendered overlay review. Native OS surfaces are validated by application QA.'}
    identities=Image.new('RGBA',(1080,1025),(238,231,215,255))
    identity_draw=ImageDraw.Draw(identities)
    actual=Image.new('RGBA',(900,380),(238,231,215,255))
    actual_draw=ImageDraw.Draw(actual)
    for row,pet in enumerate(PETS):
        manifest=json.loads((ROOT/pet/'manifest.json').read_text())
        sprite=Image.open(ROOT/pet/'avatar-256.png')
        frame={'accessoryAnchors':manifest['identityAnchors']['avatar']}
        for col,name in enumerate(('none',*ACCESSORIES)):
            image=overlay(sprite,frame,name).resize((180,180),Image.Resampling.NEAREST)
            identities.alpha_composite(image,(col*180,row*205))
            identity_draw.text((col*180+5,row*205+185),f'{pet} icon {name}',fill=(40,30,20))
        x=row*180
        actual_draw.text((x+10,5),pet,fill=(50,35,25))
        actual_draw.rectangle((x,250,x+179,380),fill=(30,25,25))
        for col,state in enumerate(('idle','blink','listen','focus')):
            retina=Image.open(ROOT/pet/f'menu-{state}@2x.png')
            normal=Image.open(ROOT/pet/f'menu-{state}.png')
            for y in (30,270): actual.alpha_composite(retina,(x+10+col*42,y))
            for y in (78,324): actual.alpha_composite(normal,(x+10+col*42,y))
        actual.alpha_composite(Image.open(ROOT/pet/'dock-128.png'),(x+20,110))
    identities.convert('RGB').save(QA/'identity-accessory-review.jpg',quality=90)
    actual.convert('RGB').save(QA/'identity-actual-sizes.png')
    for action in ('idle','read','write','type','walk','sleep'):
        canvas=Image.new('RGBA',(1080,1025),(238,231,215,255))
        draw=ImageDraw.Draw(canvas)
        for row,pet in enumerate(PETS):
            manifest=json.loads((ROOT/pet/'manifest.json').read_text())
            atlas=Image.open(ROOT/pet/'atlas.png')
            frame=manifest['clips'][action]['frames'][0]
            sprite=atlas.crop((frame['x'],frame['y'],frame['x']+256,frame['y']+256))
            for col,name in enumerate(('none',*ACCESSORIES)):
                image=overlay(sprite,frame,name).resize((180,180),Image.Resampling.NEAREST)
                canvas.alpha_composite(image,(col*180,row*205))
                draw.text((col*180+5,row*205+185),f'{pet} {action} {name}',fill=(40,30,20))
        canvas.convert('RGB').save(QA/f'accessories-{action}-review.jpg',quality=90)
    for pet in PETS:
        manifest=json.loads((ROOT/pet/'manifest.json').read_text())
        atlas=Image.open(ROOT/pet/'atlas.png')
        assert atlas.mode=='RGBA' and list(atlas.size)==[manifest['width'],manifest['height']]
        assert len(manifest['clips'])==24
        count=0
        head_sources={}
        for name,clip in manifest['clips'].items():
            assert 2<=len(clip['frames'])<=4
            seen=set()
            for frame in clip['frames']:
                count+=1
                x,y,w,h=(frame[k] for k in ('x','y','w','h'))
                assert min(x,y)>=0 and w==h==256 and x+w<=atlas.width and y+h<=atlas.height
                assert 80<=frame['durationMs']<=5000
                crop=atlas.crop((x,y,x+w,y+h))
                alpha=crop.getchannel('A')
                assert alpha.getextrema()[0]==0 and alpha.getextrema()[1]>200
                bounds=alpha.point(lambda a:255 if a>=48 else 0).getbbox()
                assert bounds and bounds[0]>=8 and bounds[1]>=8 and bounds[2]<=248 and bounds[3]<=244
                digest=hashlib.sha256(crop.tobytes()).hexdigest()
                assert digest not in seen,(pet,name,'duplicate frame')
                seen.add(digest)
                placement=frame['accessoryAnchors']
                assert placement['supported'] and placement['orientation'] in ('front','quarter','right')
                head_sources[placement['source']]=head_sources.get(placement['source'],0)+1
        assert count==50
        for state in ('idle','blink','listen','focus'):
            for suffix,size in (('',18),('@2x',36)):
                icon=Image.open(ROOT/pet/f'menu-{state}{suffix}.png')
                assert icon.mode=='RGBA' and icon.size==(size,size)
        for size in (64,128,256,512,1024):
            assert Image.open(ROOT/pet/f'dock-{size}.png').size==(size,size)
        contact=Image.new('RGBA',atlas.size,(235,230,215,255))
        contact.alpha_composite(atlas)
        contact.resize((1024,896)).convert('RGB').save(QA/f'{pet}-animation-contact.jpg',quality=88)
        report['pets'][pet]={'clips':24,'frames':50,'atlas':list(atlas.size),'alphaAndGutters':'passed',
                             'identitySizes':'passed','frameUniqueness':'passed','landmarkSources':head_sources}
    # Loop every actual animation in parallel for motion inspection.
    for pet in PETS:
        manifest=json.loads((ROOT/pet/'manifest.json').read_text());atlas=Image.open(ROOT/pet/'atlas.png')
        sequence=[]
        for phase in range(4):
            sheet=Image.new('RGBA',(768,600),(235,230,215,255));draw=ImageDraw.Draw(sheet)
            for i,(name,clip) in enumerate(manifest['clips'].items()):
                f=clip['frames'][phase%len(clip['frames'])]
                sprite=atlas.crop((f['x'],f['y'],f['x']+256,f['y']+256)).resize((128,128),Image.Resampling.NEAREST)
                sheet.alpha_composite(sprite,((i%6)*128,(i//6)*150))
                draw.text(((i%6)*128+5,(i//6)*150+132),name,fill=(50,35,25))
            sequence.append(sheet.convert('RGB'))
        sequence[0].save(QA/f'{pet}-24-actions.gif',save_all=True,append_images=sequence[1:],loop=0,duration=400,disposal=2)
    (QA/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print('PASS: five pets, 120 clips, 250 frames, identity dimensions, alpha gutters and manifest bounds')


if __name__=='__main__': main()
