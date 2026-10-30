# v2.7.0 原创写实材质

使用内置 ImageGen 生成，2026-10-30。未复制《黑暗欺骗》的贴图。PNG 原始输出保留于此，运行时通过 Three.js 纹理坐标重复或取图集分区；下述输出均未使用外部图像编辑器修改。

- `damask-v270.png`：灰绿旧式提花墙纸。
- `walnut-v270.png`：旧胡桃木门与木作。
- `carpet-v270.png`：暗红织物地毯。
- `paintings-v270.png`：三幅原创油画图集，三等分 UV，共享解码图片。

只作为颜色与轻微凹凸材质使用；粗糙度、金属度、照明、阴影和几何结构在代码中定义。这些不是从原游戏提取的 PBR 扫描数据，也不保证物理测量精度。

## 完整提示词

### paper

Use case: photorealistic-natural. Asset type: a square seamless tileable albedo texture for a real-time 3D old hotel corridor, NOT a room render. Generate an original late Victorian woven damask wallpaper material. Dense intricate acanthus leaves, curling tendrils and small floral medallions, four repeating motifs across each edge, muted desaturated olive-grey and worn warm stone colours. Photographic close-up of flat fabric-backed wallpaper, subtle woven threads, uneven faded pigment, delicate age wear and tiny rubbed spots. Moderate low contrast, no black silhouettes, no large empty areas, no stains dominating the pattern. Perfect straight-on orthographic flat surface, evenly lit ambient neutral light, no directional light, no cast shadows, no vignette, no perspective, no folds, no border, no text or logos. Seamless repeating boundaries left/right and top/bottom. Texture must be believable, ornate but quiet, suitable for dim hotel lighting. Full image is only wallpaper. Square 1024 by 1024.

### wood

Use case: photorealistic-natural. Asset type: square seamless tileable albedo material for dark polished walnut hotel doors and panelling in a real-time 3D game. Only the flat wood surface, no door object, no room, no frame. Rich aged dark brown walnut, close subtle vertical grain, several narrow natural grain bands, faint pores, minute scratches and rubbed varnish, restrained real age. Photographic material scan, straight-on orthographic, neutral uniform diffuse lighting, no highlights, no directional shadows, no perspective, no border, no text. Seamless on all edges. Avoid exaggerated whorls, orange tones, cartoon brush strokes, panel seams or heavy damage. Square 1024x1024, useful natural midtone albedo; game lighting supplies darkness.

### carpet

Use case: photorealistic-natural. Asset type: square seamless tileable albedo material for an old luxury hotel's corridor carpet. Full image only flat woven carpet, no room, no perspective, no borders. Deep muted oxblood burgundy with tiny faded ochre and charcoal floral scrolling motifs, very dense understated pattern, visible short wool pile and woven thread texture, slight foot-traffic wear. Each motif small, no large central medallion, no obvious diamond grid, no long stripes. Photorealistic close-up material scan under completely even neutral lighting, no shadows or highlights, no text, no logos. Seamless left-right and top-bottom. Square 1024x1024.

### art

Use case: photorealistic-natural. Asset type: a texture atlas of THREE original Victorian oil paintings for an old hotel's picture frames in a 3D game. Wide image aspect ratio 9:4, three equal portrait panels arranged directly side-by-side, EXACT vertical division at one-third and two-thirds, no gutters, no picture frames, no border. Each panel has 3:4 proportions. Left: a forbidding old manor among bare trees at twilight with two lit windows. Centre: a fog-covered stone bridge over a dark river, distant muted sky, romantic landscape. Right: a formal 19th-century portrait of a fictional elderly hotel proprietor in dark clothing, solemn eyes, no celebrity likeness. Authentic photographed antique oil paintings, fine painterly detail, aged varnish, subtle craquelure and canvas weave, dark but readable subdued umber, dusty olive, slate blue and tarnished gold palette, museum-quality old artwork rather than cartoon illustration. Flat straight-on scan with even neutral illumination, no reflections, no cast shadows, no signatures, no letters or watermarks. Produce all three paintings in one atlas only, no room setting.
