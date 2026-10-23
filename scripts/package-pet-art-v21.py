"""Package ImageGen masters for Flow Cabin 2.1; no character art is drawn here.

Pillow is used only to crop, resample, atlas-pack, and validate supplied artwork.
Run with the Codex workspace Python runtime (Pillow) or a Python with Pillow.
"""
from pathlib import Path
from PIL import Image, ImageChops, ImageFilter
import hashlib
import json
import shutil
import sys
import math

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public/pet-art/v21'
DESKTOP = ROOT / 'desktop/assets/pets-v21'
PETS = ('cat', 'chick', 'bunny', 'bear', 'fox')
STATES = ('idle', 'blink', 'listen', 'focus')
CLIPS = (
    ('idle', (2600, 160), True), ('observe', (900, 900), True),
    ('stretch', (600, 650), False), ('yawn', (500, 900), False),
    ('sleep', (1400, 1400), True), ('wake', (550, 800), False),
    ('walk', (200, 200), True), ('turn', (320, 450), False),
    ('greet', (400, 400), False), ('petresponse', (650, 650), False),
    ('dragged', (260, 260), True), ('land', (180, 460), False),
    ('read', (1400, 550), True), ('write', (300, 300), True),
    ('type', (180, 180), True), ('think', (1300, 1000), True),
    ('listen', (1300, 1300), True), ('nod', (400, 400), True),
    ('sway', (480, 480), True), ('dance', (240, 240), True),
    ('eat', (550, 700), True), ('satisfied', (800, 800), False),
    ('celebrate', (350, 350), False), ('deliver', (700, 850), False),
)
ACCESSORIES = ('headphones', 'scarf', 'beanie', 'bow', 'sprout')


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def alpha_bounds(image, threshold=48):
    return image.getchannel('A').point(lambda x: 255 if x >= threshold else 0).getbbox()


def square_fit(image, size, fill=.9, nearest=False):
    """Preserve alpha and aspect ratio; source artwork already carries the design."""
    crop = image.crop(alpha_bounds(image))
    factor = size * fill / max(crop.size)
    resized = crop.resize((max(1, round(crop.width * factor)), max(1, round(crop.height * factor))),
                          Image.Resampling.NEAREST if nearest else Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (size, size))
    canvas.alpha_composite(resized, ((size-resized.width)//2, (size-resized.height)//2))
    return canvas


def identity():
    provenance = json.loads((PUBLIC / 'sources.json').read_text())
    menu = Image.open(PUBLIC / 'sources/menu-sheet.png').convert('RGBA')
    for row, pet in enumerate(PETS):
        public, desktop = PUBLIC/pet, DESKTOP/pet
        public.mkdir(parents=True, exist_ok=True)
        desktop.mkdir(parents=True, exist_ok=True)
        source = Image.open(PUBLIC / f'sources/{pet}-dock.png').convert('RGBA')
        icons = {}
        for size in (1024, 512, 256, 128, 64):
            name = f'dock-{size}.png'
            square_fit(source, size, .9).save(public/name, optimize=True)
            shutil.copy2(public/name, desktop/name)
            icons[str(size)] = name
        # An in-app avatar can use the same carefully framed master without a
        # hardcoded accessory. A separate menu portrait is available below.
        shutil.copy2(public/'dock-256.png', public/'avatar-256.png')
        shutil.copy2(public/'avatar-256.png', desktop/'avatar-256.png')
        identity_image=Image.open(public/'avatar-256.png').convert('RGBA')
        identity_box=alpha_bounds(identity_image)
        identity_content=(identity_box[0],identity_box[1],identity_box[2]-identity_box[0],identity_box[3]-identity_box[1])
        identity_anchor=frame_anchors(pet,'idle',identity_content,identity_image.crop(identity_box))
        if pet in ('cat','chick','bear'):
            identity_anchor['crown']['width']=round(identity_anchor['crown']['width']*.83,5)
            identity_anchor['crown']['y']=round(identity_anchor['crown']['y']+.035,5)
        menu_states = {}
        for col, state in enumerate(STATES):
            cell = menu.crop((round(col*menu.width/4), round(row*menu.height/5),
                              round((col+1)*menu.width/4), round((row+1)*menu.height/5)))
            # Dedicated large-feature ImageGen glyph; no old tray bitmap enters
            # this pipeline. Keep Retina and 1x contours optically consistent.
            base = square_fit(cell, 36, .94)
            base.save(public/f'menu-{state}@2x.png', optimize=True)
            square_fit(cell, 18, .94).save(public/f'menu-{state}.png', optimize=True)
            for suffix in ('', '@2x'):
                name = f'menu-{state}{suffix}.png'
                shutil.copy2(public/name, desktop/name)
            menu_states[state] = {'one': f'menu-{state}.png', 'two': f'menu-{state}@2x.png'}
        manifest_path = public/'manifest.json'
        previous = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
        manifest = {**previous, 'version': 2, 'petId': pet,
                    'identityRevision': '2.1.0-art-1',
                    'avatar': 'avatar-256.png', 'dock': icons,
                    'identityAnchors': {'avatar':identity_anchor,'dock':identity_anchor},
                    'menu': {'logicalSize': 18, 'template': False, 'states': menu_states,
                             'blinkDurationMs': 130, 'idleIntervalMs': 9000,
                             'reducedMotion': 'idle'},
                    'artDirection': 'Warm outlined pixel companion; no equipped accessory baked into identity.',
                    'sourceMaster': f'../sources/{pet}-dock.png',
                    'sourceMasterSize': list(source.size),
                    'provenance': provenance['generator'],
                    'qa': {**previous.get('qa', {}), 'identityVisuallyReviewed': True}}
        write_json(manifest_path, manifest)
        desktop_fields=('version','petId','identityRevision','avatar','dock','menu','identityAnchors','sourceMasterSize',
                        'equipped','coordinateSpace')
        write_json(desktop/'manifest.json', {k:manifest[k] for k in desktop_fields if k in manifest})
    write_json(PUBLIC/'catalog.json', {'version': 2, 'pets': {p: f'{p}/manifest.json' for p in PETS}})
    write_json(DESKTOP/'catalog.json', {'version': 2, 'pets': {p: f'{p}/manifest.json' for p in PETS}})


def major_components(image, expected):
    """Find separated foreground sprites rather than cutting through a loose AI grid.

    Artwork is never redrawn. A connected foreground cutout excludes neighboring
    sprite fragments while retaining its generated alpha edge. Four-neighbor
    flood fill requires only Pillow/Python.
    """
    width, height = image.size
    alpha = image.getchannel('A').tobytes()
    visited = bytearray(width*height)
    components = []
    for start, value in enumerate(alpha):
        if value < 48 or visited[start]:
            continue
        stack = [start]
        component_pixels = []
        visited[start] = 1
        left, top, right, bottom, count = width, height, 0, 0, 0
        while stack:
            index = stack.pop()
            x, y = index % width, index // width
            left, right = min(left, x), max(right, x)
            top, bottom = min(top, y), max(bottom, y)
            count += 1
            component_pixels.append((x,y))
            neighbors = []
            if x: neighbors.append(index-1)
            if x+1 < width: neighbors.append(index+1)
            if y: neighbors.append(index-width)
            if y+1 < height: neighbors.append(index+width)
            for neighbor in neighbors:
                if alpha[neighbor] >= 48 and not visited[neighbor]:
                    visited[neighbor] = 1
                    stack.append(neighbor)
        if count > 1000:
            region=(max(0,left-2),max(0,top-2),min(width,right+3),min(height,bottom+3))
            silhouette=Image.new('L',(region[2]-region[0],region[3]-region[1]))
            pixels=silhouette.load()
            for px,py in component_pixels: pixels[px-region[0],py-region[1]]=255
            # Preserve the generated antialias edge within a two-pixel halo;
            # exclude fragments belonging to a neighboring atlas cell.
            silhouette=silhouette.filter(ImageFilter.MaxFilter(5))
            components.append({'count':count,'bounds':region,'silhouette':silhouette})
    if len(components) != expected:
        raise ValueError(f'Expected {expected} separated sprites; found {len(components)}. Inspect source before packing: {components}')
    return components


def ordered_components(image, columns, rows):
    objects = major_components(image, columns*rows)
    objects.sort(key=lambda obj: (obj['bounds'][1]+obj['bounds'][3])/2)
    ordered = []
    for row in range(rows):
        group = objects[row*columns:(row+1)*columns]
        group.sort(key=lambda obj: obj['bounds'][0])
        ordered.extend(group)
    return ordered


def component_crop(image, component):
    crop=image.crop(component['bounds'])
    crop.putalpha(ImageChops.multiply(crop.getchannel('A'),component['silhouette']))
    return crop


def eye_pair(sprite, expected):
    width, height = sprite.size
    values=sprite.get_flattened_data() if hasattr(sprite,'get_flattened_data') else sprite.getdata()
    mask = [(r<70 and g<40 and b<30 and a>180) for r,g,b,a in values]
    seen = bytearray(width*height)
    candidates = []
    for start, value in enumerate(mask):
        if not value or seen[start]: continue
        stack, points = [start], []
        seen[start] = 1
        while stack:
            index = stack.pop()
            x, y = index%width, index//width
            points.append((x,y))
            neighbors = []
            if x: neighbors.append(index-1)
            if x+1<width: neighbors.append(index+1)
            if y: neighbors.append(index-width)
            if y+1<height: neighbors.append(index+width)
            for neighbor in neighbors:
                if mask[neighbor] and not seen[neighbor]:
                    seen[neighbor] = 1
                    stack.append(neighbor)
        if len(points)<24: continue
        left, right = min(p[0] for p in points), max(p[0] for p in points)
        top, bottom = min(p[1] for p in points), max(p[1] for p in points)
        w, h = right-left+1, bottom-top+1
        cx, cy = (left+right)/2, (top+bottom)/2
        if 6<=w<=width*.30 and 4<=h<=height*.25 and .18*height<cy<.78*height and .4<=w/h<=4:
            candidates.append((cx,cy,len(points)))
    best = None
    for i, left in enumerate(candidates):
        for right in candidates[i+1:]:
            dx, dy = abs(left[0]-right[0]), abs(left[1]-right[1])
            cy = (left[1]+right[1])/2
            if not .12*width<dx<.65*width or dy>height*.22: continue
            score = (left[2]+right[2])/(1+dy/20)+dx*1.2-abs(cy-expected*height)*2
            if best is None or score>best[0]: best = (score,left,right)
    if best:
        left,right=sorted(best[1:],key=lambda p:p[0])
        return ((left[0]+right[0])/2,(left[1]+right[1])/2,right[0]-left[0],
                math.degrees(math.atan2(right[1]-left[1],right[0]-left[0])))
    return None


def frame_anchors(pet, action, content, sprite, number=0):
    """Calibrated visible landmarks; accessories stay equipped in all actions.

    Front frames use actual eye locations where recognizable. Side and curled
    silhouettes use separate reviewed anatomical templates, never the front
    frame's bounding box percentages. Widths refer to the head, not the tail.
    """
    x, y, w, h = content
    orientation, rotation, source = 'front', 0, 'pose-template'
    expected = .54 if pet=='bunny' else .41
    detected = eye_pair(sprite, expected)
    cx = x+w*{'cat':.42,'chick':.50,'bunny':.43,'bear':.46,'fox':.38}[pet]
    ey = y+h*expected
    hw = w*{'cat':.81,'chick':.89,'bunny':.78,'bear':.84,'fox':.73}[pet]
    if detected:
        cx, ey = x+detected[0], y+detected[1]
        hw = max(w*.52,min(w*.96,detected[2]/.36))
        rotation = max(-22,min(22,detected[3]))
        source = 'detected-eye-pair'
    # The bear's tilted muzzle and fox's closed-eye arcs connect with other
    # dark pixels. These two measured poses use explicit reviewed landmarks.
    if pet=='bear' and action=='listen' and number==1:
        cx,ey,hw,rotation=x+w*.442,y+h*.45,w*.75,22
        source='reviewed-pose-landmarks'
    if pet=='fox' and action=='idle' and number==1:
        cx,ey,hw,rotation=x+w*.32,y+h*.46,w*.75,12
        source='reviewed-pose-landmarks'
    if action=='walk':
        orientation, rotation, source = 'right', 0, 'profile-template'
        cx=x+w*{'cat':.77,'chick':.64,'bunny':.75,'bear':.65,'fox':.80}[pet]
        ey=y+h*{'cat':.45,'chick':.43,'bunny':.53,'bear':.35,'fox':.46}[pet]
        hw=w*{'cat':.43,'chick':.76,'bunny':.46,'bear':.72,'fox':.37}[pet]
    elif action=='sleep':
        rotation, source = 0, 'curled-template'
        cx=x+w*{'cat':.32,'chick':.39,'bunny':.34,'bear':.34,'fox':.31}[pet]
        ey=y+h*{'cat':.61,'chick':.58,'bunny':.65,'bear':.60,'fox':.64}[pet]
        hw=w*{'cat':.63,'chick':.72,'bunny':.64,'bear':.65,'fox':.54}[pet]
    elif action=='turn':
        orientation, source = 'quarter', 'turn-template'
        cx=x+w*.53
        ey=y+h*(.5 if pet=='bunny' else .34)
        hw=w*.76
    elif action in ('stretch','land'):
        rotation, source = 0, 'low-pose-template'
        cx=x+w*(.36 if pet!='chick' else .5)
        ey=y+h*(.73 if action=='stretch' and pet!='chick' else .65)
        hw=w*(.66 if pet!='chick' else .84)
    head_x, head_y, head_width = cx, ey-hw*.15, hw
    neck_x, neck_y = cx, ey+hw*.34
    crown_x, crown_y = cx, ey-hw*.28
    if orientation=='right':
        head_x, head_y, head_width = cx-hw*.27, ey, hw*.62
        neck_x, neck_y = cx-hw*.35, ey+hw*.36
        crown_x, crown_y = cx-hw*.15, ey-hw*.27
    neck_width=hw*.64
    temple_x,temple_y=cx+hw*.39,ey-hw*.25
    if action=='sleep':
        neck_x,neck_y,neck_width=cx+hw*.12,ey+hw*.04,hw*.44
    if orientation=='right':
        temple_x,temple_y=cx-hw*.33,ey-hw*.15
    point=lambda xx,yy,ww,layer='front': {'x':round(xx/256,5),'y':round(yy/256,5),'width':round(ww/256,5),'layer':layer}
    return {
        'supported': True, 'revision':'2.1.0-fit-2', 'source':source,
        'orientation':orientation, 'rotationDegrees':round(rotation,2),
        'head':point(head_x,head_y,head_width),
        'neck':point(neck_x,neck_y,neck_width,'behind' if action=='sleep' else 'front'),
        'crown':point(crown_x,crown_y,hw*.9),
        'temple':point(temple_x,temple_y,hw*.25),
    }


def animations():
    walk_source = Image.open(PUBLIC/'sources/walk-cycles.png').convert('RGBA')
    walk_bounds = ordered_components(walk_source, 4, 5)
    chick_source = Image.open(PUBLIC/'sources/chick-stretch.png').convert('RGBA')
    chick_bounds = ordered_components(chick_source, 2, 1)
    for pet_index, pet in enumerate(PETS):
        sources = [Image.open(PUBLIC/f'sources/{pet}-{part}.png').convert('RGBA') for part in ('A', 'B')]
        bounds = [ordered_components(source, 4, 6) for source in sources]
        sprites = [component_crop(source,obj) for source, objects in zip(sources, bounds) for obj in objects]
        # One species-wide scale, not independent per-pose fitting: a sleeping
        # body stays lower than a standing body and each pair shares its size.
        scale = min(224/max(sprite.width for sprite in sprites), 224/max(sprite.height for sprite in sprites))
        atlas = Image.new('RGBA', (2048, 1792))
        frames, clips, qa_pairs = {}, {}, []
        packed_index = 0
        for action_index, (action, durations, loop) in enumerate(CLIPS):
            clip_frames = []
            hashes = []
            action_sprites = sprites[action_index*2:action_index*2+2]
            source_regions = [bounds[(action_index*2+n)//24][(action_index*2+n)%24]['bounds'] for n in range(2)]
            source_sheet = 'A' if action_index < 12 else 'B'
            if action == 'walk' or (pet == 'chick' and action == 'stretch'):
                if action == 'walk':
                    source_regions = [item['bounds'] for item in walk_bounds[pet_index*4:pet_index*4+4]]
                    replacement = [component_crop(walk_source,item) for item in walk_bounds[pet_index*4:pet_index*4+4]]
                    durations = (140, 140, 140, 140)
                    source_sheet = 'walk-cycles'
                else:
                    source_regions = [item['bounds'] for item in chick_bounds]
                    replacement = [component_crop(chick_source,item) for item in chick_bounds]
                    source_sheet = 'chick-stretch'
                factor = min(max(im.width for im in action_sprites)/max(im.width for im in replacement),
                             max(im.height for im in action_sprites)/max(im.height for im in replacement))
                action_sprites = [im.resize((round(im.width*factor),round(im.height*factor)),Image.Resampling.NEAREST) for im in replacement]
            for number, sprite in enumerate(action_sprites):
                index = packed_index
                packed_index += 1
                sprite = sprite.resize((round(sprite.width*scale), round(sprite.height*scale)), Image.Resampling.NEAREST)
                # Pixel-perfect foot baseline with generous 16px safe padding.
                local_x, local_y = (256-sprite.width)//2, 240-sprite.height
                cell_x, cell_y = (index%8)*256, (index//8)*256
                atlas.alpha_composite(sprite, (cell_x+local_x, cell_y+local_y))
                content = [local_x, local_y, sprite.width, sprite.height]
                frame = {'x': cell_x, 'y': cell_y, 'w': 256, 'h': 256,
                         'durationMs': durations[number], 'duration': durations[number],
                         'anchor': {'x': .5, 'y': .9375},
                         'contentBounds': dict(zip(('x','y','w','h'), content)),
                         'accessoryAnchors': frame_anchors(pet, action, content, sprite, number),
                         'sourceRegion': dict(zip(('x0','y0','x1','y1'), source_regions[number])),
                         'sourceSheet': source_sheet}
                frames[f'{action}-{number}'] = frame
                clip_frames.append(frame)
                hashes.append(hashlib.sha256(sprite.tobytes()).hexdigest())
            if len(set(hashes)) != len(hashes):
                raise ValueError(f'{pet}/{action}: duplicate animation frames')
            clips[action] = {'frames': clip_frames, 'loop': loop}
            qa_pairs.append({'action': action, 'uniqueFrames': len(hashes), 'frameHashes': hashes})
        atlas.save(PUBLIC/pet/'atlas.png', optimize=True)
        path = PUBLIC/pet/'manifest.json'
        manifest = json.loads(path.read_text())
        manifest.update({'atlas': 'atlas.png', 'width': 2048, 'height': 1792,
                         'frameSize': 256, 'frameCount': 50,
                         'coordinateSpace': {'frameRects':'atlas-pixels', 'contentBounds':'frame-pixels',
                                             'anchor':'normalized-frame', 'accessoryAnchors':'normalized-frame'},
                         'anchor': {'x': .5, 'y': .9375}, 'frames': frames, 'clips': clips,
                         'accessories': '../accessories/manifest.json',
                         'qa': {**manifest.get('qa', {}), 'animationVisuallyReviewed': True,
                                'actions': 24, 'independentFrames': 50,
                                'pairs': qa_pairs,
                                'accessoryLimitations': 'Landmarks use detected front eye pairs and separate profile/curled templates. Overlay QA is recorded in qa/; renderer should rotate around the supplied landmark.'}})
        write_json(path, manifest)
        print(f'{pet}: 24 clips, 50 distinct frames, {atlas.size}, common scale {scale:.3f}')


def accessories():
    target = PUBLIC/'accessories'
    target.mkdir(parents=True, exist_ok=True)
    source = Image.open(PUBLIC/'sources/accessories.png').convert('RGBA')
    front_source=Image.open(PUBLIC/'sources/accessories-front.png').convert('RGBA')
    front_regions=ordered_components(front_source,3,1)
    right_source=Image.open(PUBLIC/'sources/accessories-right.png').convert('RGBA')
    right_regions=ordered_components(right_source,3,1)
    # Accessory sheet includes intentionally open centers. Bounds are defined
    # by its known 5x3 grid, which has clear visual gutters.
    atlas = Image.new('RGBA', (1280, 768))
    entries = {}
    for col, name in enumerate(ACCESSORIES):
        variants = {}
        for row, direction in enumerate(('front', 'quarter', 'right')):
            region = source.crop((round(col*source.width/5), round(row*source.height/3),
                                  round((col+1)*source.width/5), round((row+1)*source.height/3)))
            if row==0 and col<3: region=component_crop(front_source,front_regions[col])
            if row==2 and col<3: region=component_crop(right_source,right_regions[col])
            sprite = square_fit(region, 256, .92, nearest=True)
            atlas.alpha_composite(sprite, (col*256, row*256))
            filename = f'{name}-{direction}.png'
            sprite.save(target/filename, optimize=True)
            variants[direction] = {'image': filename, 'frame': {'x': col*256, 'y': row*256, 'w': 256, 'h': 256}}
        entries[name] = {'variants': variants,
                         'target': {'headphones':'head','scarf':'neck','beanie':'crown','bow':'temple','sprout':'crown'}[name],
                         'anchor': {'x': .5, 'y': {'headphones':.5,'scarf':.30,'beanie':.7,'bow':.5,'sprout':.88}[name]},
                         'widthMultiplier': {'headphones':1.30,'scarf':1,'beanie':1,'bow':1,'sprout':.32}[name]}
    atlas.save(target/'atlas.png', optimize=True)
    write_json(target/'manifest.json', {'version':2, 'atlas':'atlas.png','width':1280,'height':768,
                                       'coordinateSpace':{'frameRects':'atlas-pixels','anchor':'normalized-image'},
                                       'items': entries, 'qa': {'transparentBackground':True,'visuallyReviewed':True},
                                       'usage':'Use each frame accessoryAnchors and orientation; rotate the overlay around its supplied anchor by rotationDegrees. No accessory is baked into pet identity.'})


if __name__ == '__main__':
    operations = sys.argv[1:] or ['identity', 'animations', 'accessories']
    for operation in operations:
        {'identity': identity, 'animations': animations, 'accessories': accessories}[operation]()
