"""Precompose equipped identity icons from reviewed ImageGen artwork.

Only compositing, framing and resampling happen here. The base pet PNGs stay
unchanged. Menu images use dedicated portrait masters and portrait landmarks,
never a full-body Dock icon shrunk to tray size.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import hashlib
import importlib.util
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public/pet-art/v21'
DESKTOP = ROOT / 'desktop/assets/pets-v21'
QA = PUBLIC / 'qa'
PETS = ('cat', 'chick', 'bunny', 'bear', 'fox')
STATES = ('idle', 'blink', 'listen', 'focus')
ITEMS = json.loads((PUBLIC / 'accessories/manifest.json').read_text())['items']
REVISION = '2.1.0-equipped-1'

spec = importlib.util.spec_from_file_location('pet_art_packaging', ROOT / 'scripts/package-pet-art-v21.py')
packaging = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packaging)


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def bounds(image):
    return packaging.alpha_bounds(image, 48)


def composite(sprite, placement, accessory, graphics, padding=0, optical_scale=1):
    """Preserve normalized target, clockwise rotation and behind ordering."""
    size = sprite.width
    item = ITEMS[accessory]
    point = placement[item['target']]
    width = max(1, round(point['width'] * size * item['widthMultiplier'] * optical_scale))
    graphic = graphics[accessory].resize((width, width), Image.Resampling.NEAREST)
    center = (point['x'] * size + padding, point['y'] * size + padding)
    origin = (round(center[0] - width * item['anchor']['x']),
              round(center[1] - width * item['anchor']['y']))
    layer = Image.new('RGBA', (size + padding * 2, size + padding * 2))
    layer.alpha_composite(graphic, origin)
    layer = layer.rotate(-placement.get('rotationDegrees', 0),
                         resample=Image.Resampling.NEAREST, center=center)
    body = Image.new('RGBA', layer.size)
    body.alpha_composite(sprite, (padding, padding))
    if point.get('layer') == 'behind':
        layer.alpha_composite(body)
        return layer
    body.alpha_composite(layer)
    return body


def high_resolution_accessories():
    """Export original accessory cutouts at 1024, avoiding a 256px upscale."""
    source = Image.open(PUBLIC / 'sources/accessories.png').convert('RGBA')
    front = Image.open(PUBLIC / 'sources/accessories-front.png').convert('RGBA')
    front_regions = packaging.ordered_components(front, 3, 1)
    result = {}
    for col, name in enumerate(ITEMS):
        region = source.crop((round(col * source.width / 5), 0,
                              round((col + 1) * source.width / 5), round(source.height / 3)))
        if col < 3:
            region = packaging.component_crop(front, front_regions[col])
        result[name] = packaging.square_fit(region, 1024, .92, nearest=True)
    return result


def portrait_anchor(pet, state, image):
    """Landmarks measured on the dedicated menu portrait, not body anchors.

    Listening portraits tilt clockwise, and their face center shifts left.
    Closed or lowered eyes keep the anatomical landmarks stable.
    """
    left, top, right, bottom = bounds(image)
    w, h, size = right - left, bottom - top, image.width
    center_x = {'cat': .49, 'chick': .5, 'bunny': .48, 'bear': .5, 'fox': .43}[pet]
    eye_y = {'cat': .53, 'chick': .51, 'bunny': .65, 'bear': .51, 'fox': .53}[pet]
    head_width = {'cat': .91, 'chick': .93, 'bunny': .86, 'bear': .89, 'fox': .76}[pet]
    rotation = 0
    if state == 'listen':
        center_x -= .045
        eye_y -= .025
        rotation = 16
    cx, ey, hw = left + w * center_x, top + h * eye_y, w * head_width
    point = lambda x, y, width: {'x': round(x / size, 5), 'y': round(y / size, 5),
                                  'width': round(width / size, 5), 'layer': 'front'}
    return {'supported': True, 'revision': REVISION, 'source': 'reviewed-menu-portrait-landmarks',
            'orientation': 'front', 'rotationDegrees': rotation,
            'head': point(cx, ey - hw * .19, hw),
            'neck': point(cx, ey + hw * .30, hw * .66),
            'crown': point(cx, ey - hw * .30, hw * .77),
            'temple': point(cx + hw * .38, ey - hw * .24, hw * .27)}


def fit_sequence(images, size, fill=.88):
    """One crop and scale for all states of a variant prevents blink jitter."""
    boxes = [bounds(image) for image in images]
    box = (min(b[0] for b in boxes), min(b[1] for b in boxes),
           max(b[2] for b in boxes), max(b[3] for b in boxes))
    factor = size * fill / max(box[2] - box[0], box[3] - box[1])
    width, height = max(1, round((box[2] - box[0]) * factor)), max(1, round((box[3] - box[1]) * factor))
    result = []
    for image in images:
        scaled = image.crop(box).resize((width, height), Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA', (size, size))
        canvas.alpha_composite(scaled, ((size - width) // 2, (size - height) // 2))
        result.append(canvas)
    return result


def package():
    base_hashes = {str(p.relative_to(PUBLIC)): sha(p) for pet in PETS
                   for p in (PUBLIC / pet).glob('*.png')}
    graphics = high_resolution_accessories()
    menu_sheet = Image.open(PUBLIC / 'sources/menu-sheet.png').convert('RGBA')
    for row, pet in enumerate(PETS):
        public, desktop = PUBLIC / pet, DESKTOP / pet
        manifest = json.loads((public / 'manifest.json').read_text())
        dock = Image.open(public / 'dock-1024.png').convert('RGBA')
        portraits, menu_anchors = [], {}
        for col, state in enumerate(STATES):
            crop = menu_sheet.crop((round(col * menu_sheet.width / 4), round(row * menu_sheet.height / 5),
                                    round((col + 1) * menu_sheet.width / 4), round((row + 1) * menu_sheet.height / 5)))
            # The loose source grid has a few neighboring ear-tip fragments.
            # Isolate only the large connected portrait before size fitting.
            portrait_region = packaging.major_components(crop, 1)[0]
            crop = packaging.component_crop(crop, portrait_region)
            portrait = packaging.square_fit(crop, 512, .9, nearest=True)
            portraits.append(portrait)
            menu_anchors[state] = portrait_anchor(pet, state, portrait)
        equipped = {}
        for name in ITEMS:
            directory, native = public / 'equipped' / name, desktop / 'equipped' / name
            directory.mkdir(parents=True, exist_ok=True)
            native.mkdir(parents=True, exist_ok=True)
            # Extra compositing margin allows rotated artwork to remain intact.
            master = composite(dock, manifest['identityAnchors']['dock'], name, graphics, padding=128)
            master = packaging.square_fit(master, 1024, .90)
            for size in (1024, 512):
                master.resize((size, size), Image.Resampling.LANCZOS).save(directory / f'dock-{size}.png', optimize=True)
            master.resize((256, 256), Image.Resampling.LANCZOS).save(directory / 'avatar-256.png', optimize=True)
            optical_scale = {'bow': 1.4, 'sprout': 1.5}.get(name, 1)
            composites = [composite(portrait, menu_anchors[state], name, graphics,
                                    padding=96, optical_scale=optical_scale)
                          for portrait, state in zip(portraits, STATES)]
            menu_states = {}
            prefix = f'equipped/{name}'
            for suffix, size in (('', 18), ('@2x', 36)):
                for state, rendered in zip(STATES, fit_sequence(composites, size)):
                    rendered.save(directory / f'menu-{state}{suffix}.png', optimize=True)
            for state in STATES:
                menu_states[state] = {'one': f'{prefix}/menu-{state}.png', 'two': f'{prefix}/menu-{state}@2x.png'}
            equipped[name] = {'accessory': name, 'revision': REVISION,
                              'avatar': f'{prefix}/avatar-256.png',
                              'dock': {str(size): f'{prefix}/dock-{size}.png' for size in (512, 1024)},
                              'menu': {**manifest['menu'], 'states': menu_states,
                                       'equipmentOpticalScale': optical_scale}}
            for path in directory.glob('*.png'):
                shutil.copy2(path, native / path.name)
        manifest['equipped'] = equipped
        manifest['identityAnchors']['menu'] = menu_anchors
        manifest['coordinateSpace']['identityAnchors'] = 'normalized-image'
        manifest['qa']['equippedIdentityRevision'] = REVISION
        write_json(public / 'manifest.json', manifest)
        native_manifest = json.loads((desktop / 'manifest.json').read_text())
        native_manifest.update({'equipped': equipped, 'identityAnchors': manifest['identityAnchors'],
                                'coordinateSpace': {'identityAnchors': 'normalized-image'}})
        write_json(desktop / 'manifest.json', native_manifest)
    assert all(sha(PUBLIC / path) == digest for path, digest in base_hashes.items()), 'Base art changed'
    return base_hashes


def qa(base_hashes):
    QA.mkdir(exist_ok=True)
    report = {'revision': REVISION, 'pets': {}, 'baseArtworkUnchanged': True,
              'scope': 'PNG dimensions, alpha, source identity preservation, distinct animation states, mirror hashes, actual-size menu and rendered Dock review. Native OS integration remains application QA.'}
    actual = Image.new('RGBA', (1120, 490), (236, 231, 218, 255))
    ad = ImageDraw.Draw(actual)
    ad.text((12, 8), 'Equipped menu portraits - 18px logical, 36px Retina, unchanged base at left', fill=(45, 35, 25))
    all_size = 0
    for row, pet in enumerate(PETS):
        canvas = Image.new('RGBA', (1020, 760), (237, 231, 218, 255))
        draw = ImageDraw.Draw(canvas)
        draw.text((14, 8), f'{pet}: cached equipped identity | 128px Dock | 18px and 36px menu | dark/light', fill=(45, 35, 25))
        pet_bytes, count = 0, 0
        menu_hashes = {}
        for col, name in enumerate(('none', *ITEMS)):
            folder = PUBLIC / pet if name == 'none' else PUBLIC / pet / 'equipped' / name
            x, y = 12 + col * 184, 36 + row * 90
            ad.text((x, y), f'{pet} / {name}', fill=(45, 35, 25))
            for number, state in enumerate(STATES):
                actual.alpha_composite(Image.open(folder / f'menu-{state}.png'), (x + number * 20, y + 18))
                actual.alpha_composite(Image.open(folder / f'menu-{state}@2x.png'), (x + number * 40, y + 42))
            if name == 'none':
                continue
            index = tuple(ITEMS).index(name)
            yy = 40 + index * 140
            draw.rectangle((510, yy, 1019, yy + 136), fill=(29, 26, 26))
            for start, ink in ((0, (45, 35, 25)), (510, (238, 230, 213))):
                draw.text((start + 10, yy + 4), name, fill=ink)
                dock = Image.open(folder / 'dock-512.png').resize((128, 128), Image.Resampling.LANCZOS)
                canvas.alpha_composite(dock, (start + 85, yy + 6))
                for number, state in enumerate(STATES):
                    xx = start + 230 + number * 62
                    canvas.alpha_composite(Image.open(folder / f'menu-{state}@2x.png'), (xx, yy + 32))
                    canvas.alpha_composite(Image.open(folder / f'menu-{state}.png'), (xx + 8, yy + 83))
            menu_hashes[name] = []
            for path in folder.glob('*.png'):
                image = Image.open(path)
                size = 256 if path.name.startswith('avatar-') else int(path.stem.split('-')[1]) if path.name.startswith('dock-') else 36 if '@2x' in path.name else 18
                assert image.mode == 'RGBA' and image.size == (size, size), path
                alpha = image.getchannel('A')
                assert alpha.getextrema()[0] == 0 and alpha.getextrema()[1] > 200, path
                bb = bounds(image)
                assert bb and min(bb[0], bb[1]) >= 1 and max(bb[2], bb[3]) <= size - 1, (path, bb)
                mirror = DESKTOP / pet / 'equipped' / name / path.name
                assert sha(path) == sha(mirror), mirror
                base = PUBLIC / pet / path.name
                assert sha(path) != sha(base), ('unchanged equipment', path)
                if path.name.startswith('menu-') and '@2x' not in path.name:
                    menu_hashes[name].append(sha(path))
                count += 1
                pet_bytes += path.stat().st_size
            assert len(set(menu_hashes[name])) == 4, ('duplicated menu state', pet, name)
        assert count == 55, (pet, count)
        report['pets'][pet] = {'accessories': 5, 'pngFiles': count, 'bytesPerTree': pet_bytes,
                                'dimensionsAndAlpha': 'passed', 'distinctMenuStates': 'passed',
                                'desktopMirrorHashes': 'passed'}
        all_size += pet_bytes
        canvas.convert('RGB').save(QA / f'{pet}-equipped-identity-review.png', optimize=True)
    actual.convert('RGB').save(QA / 'equipped-menu-actual-sizes.png', optimize=True)
    report['totals'] = {'combinations': 25, 'pngFilesPerTree': 275, 'bytesPerTree': all_size,
                        'menuStatePNGsPerTree': 200, 'dockPNGsPerTree': 50, 'avatarPNGsPerTree': 25}
    report['baseHashes'] = base_hashes
    write_json(QA / 'equipped-validation.json', report)
    print(f'PASS: 25 equipped identities, 275 PNGs per tree, {all_size / 1024 / 1024:.2f} MiB per tree; base art unchanged')


if __name__ == '__main__':
    hashes = package()
    qa(hashes)
