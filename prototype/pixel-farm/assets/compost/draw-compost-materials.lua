-- 柳湾 · 堆肥材料两枚背包图（32×32）
-- aseprite --batch --script draw-compost-materials.lua
-- 1) 植物残料：橄榄绿断叶 + 浅黄断茎 + 卷曲褐叶，靠叶片与短茎撑出蓬松不对称轮廓。
-- 2) 成熟堆肥：低矮深褐土堆，表面小团粒、碎纤维和几粒暖褐亮点，边缘松散。
-- 左上受光，整像素，无抗锯齿。

local out = app.fs.filePath(debug.getinfo(1, "S").source:sub(2))
local IC = 32
local LX, LY = -0.70710678, -0.70710678

local function rgba(hex)
  return app.pixelColor.rgba((hex >> 16) & 255, (hex >> 8) & 255, hex & 255, 255)
end

local C = {
  -- 橄榄绿叶
  leafRim  = rgba(0x33401F),
  leafDeep = rgba(0x465528),
  leafSh   = rgba(0x586A32),
  leaf     = rgba(0x6C7E3E),
  leafLit  = rgba(0x84974E),
  leafHi   = rgba(0x9CAE60),
  -- 浅黄断茎
  stemRim  = rgba(0x8A7643),
  stemDk   = rgba(0xA89455),
  stem     = rgba(0xC9B77A),
  stemLit  = rgba(0xE0D29F),
  -- 卷曲褐叶
  dryRim   = rgba(0x4E2F1C),
  dryDk    = rgba(0x6B4527),
  dry      = rgba(0x8A5F3A),
  dryLit   = rgba(0xA97B4E),
  -- 堆肥
  compostRim = rgba(0x241A12),
  compostDk  = rgba(0x33251A),
  compost    = rgba(0x43301F),
  compostLit = rgba(0x533D28),
  crumb      = rgba(0x6B5136),
  crumbLit   = rgba(0x826545),
  fiber      = rgba(0x8F7350),
  warm       = rgba(0xA57C4F),
  warmLit    = rgba(0xBD9566),
}

local function layer(sprite, name, draw)
  local target = sprite:newLayer()
  target.name = name
  local pixels = Image(sprite.width, sprite.height, ColorMode.RGB)
  draw(pixels)
  sprite:newCel(target, 1, pixels, Point(0, 0))
end

local function save(sprite, name)
  while #sprite.layers > 1 and sprite.layers[1].name == "Layer 1" do
    sprite:deleteLayer(sprite.layers[1])
  end
  assert(sprite:saveAs(app.fs.joinPath(out, name .. ".aseprite")))
  assert(sprite:saveCopyAs(app.fs.joinPath(out, name .. ".png")))
  sprite:close(); print("Exported " .. name)
end

--[[ ------------------------------------------------------------------
     植物残料
     ------------------------------------------------------------------ ]]
local scraps = Sprite(IC, IC, ColorMode.RGB)
local leafRamp = { C.leafDeep, C.leafSh, C.leaf, C.leafLit, C.leafHi }

-- 一片断叶：宽卵形、尖端撕掉一小口，背光侧压深边
local function scrapLeaf(img, ox, oy, cfg)
  local a = math.rad(cfg.angle)
  local dx, dy = math.sin(a), -math.cos(a)
  local px, py = -dy, dx
  local len, width = cfg.len, cfg.width
  local curl = cfg.curl or 0

  local lu = LX * dx + LY * dy
  local lv = LX * px + LY * py
  local vs = (lv >= 0) and 1 or -1

  for y = 0, IC - 1 do
    for x = 0, IC - 1 do
      local rx, ry = x + 0.5 - ox, y + 0.5 - oy
      local u = rx * dx + ry * dy
      local v = rx * px + ry * py - curl * (math.max(0, u) / len) ^ 2
      if u >= 0 and u <= len then
        local s = u / len
        local body = math.sin(math.pi * (0.04 + 0.94 * s)) ^ 0.55
        if s > 0.84 then body = body * (1 - ((s - 0.84) / 0.16) ^ 1.4) end
        -- 撕口：中后段一侧缺一块
        local hw = width * 0.5 * body
        local torn = false
        if s > 0.56 and s < 0.80 and v > hw * 0.10 then torn = true end
        if not torn and math.abs(v) <= hw then
          local across = v / hw
          local b = 0.58 + 0.52 * (lu * (s - 0.44) + lv * across * 0.9)
          local edge = hw - math.abs(v)
          if edge < 1.0 then b = b - 0.08 end
          local level = b < 0.38 and 1 or b < 0.54 and 2 or b < 0.70 and 3 or b < 0.86 and 4 or 5
          local tone = leafRamp[level]
          local along = v * vs
          if edge < 0.9 and along < -0.2 then tone = leafRamp[math.min(5, level + 1)] end
          if edge < 0.8 and along > 0.2 then tone = C.leafRim end
          if s > 0.90 then tone = C.leafRim end
          img:drawPixel(x, y, tone)
        end
      end
    end
  end
end

-- 一小段断茎：1 像素宽，端头压深，两端斜切
local function scrapStem(img, x0, y0, x1, y1, bend)
  local dx, dy = x1 - x0, y1 - y0
  local len = math.max(1, math.sqrt(dx * dx + dy * dy))
  dx, dy = dx / len, dy / len
  local px, py = -dy, dx
  for i = 0, len do
    local t = i / len
    local cx = x0 + dx * i + px * (bend or 0) * math.sin(math.pi * t)
    local cy = y0 + dy * i + py * (bend or 0) * math.sin(math.pi * t)
    local x, y = math.floor(cx + 0.5), math.floor(cy + 0.5)
    if t < 0.10 or t > 0.90 then
      img:drawPixel(x, y, C.stemDk)
    else
      img:drawPixel(x, y, C.stem)
      img:drawPixel(x + 1, y, C.stemLit)
    end
  end
end

-- 卷曲褐叶：宽卵形，叶身向内卷
local function dryLeaf(img, ox, oy, cfg)
  local a = math.rad(cfg.angle)
  local dx, dy = math.sin(a), -math.cos(a)
  local px, py = -dy, dx
  local len, width = cfg.len, cfg.width
  local curl = cfg.curl or 1.0
  for y = 0, IC - 1 do
    for x = 0, IC - 1 do
      local rx, ry = x + 0.5 - ox, y + 0.5 - oy
      local u = rx * dx + ry * dy
      local v = rx * px + ry * py - curl * (math.max(0, u) / len) ^ 2
      if u >= 0 and u <= len then
        local s = u / len
        local body = math.sin(math.pi * (0.05 + 0.92 * s)) ^ 0.5
        if s > 0.82 then body = body * (1 - ((s - 0.82) / 0.18) ^ 1.3) end
        local hw = width * 0.5 * body
        if math.abs(v) <= hw then
          local across = v / hw
          local tone = C.dry
          if across < -0.15 then tone = C.dryLit end
          if across > 0.35 then tone = C.dryDk end
          if math.abs(v) > hw - 0.8 then tone = C.dryRim end
          -- 卷边：叶心一道深线
          if math.abs(v) < 0.7 and s > 0.25 and s < 0.8 then tone = C.dryDk end
          img:drawPixel(x, y, tone)
        end
      end
    end
  end
end

layer(scraps, "Stems", function(img)
  scrapStem(img, 7, 14, 4, 11, 0.5)
  scrapStem(img, 16, 20, 20, 23, -0.4)
  scrapStem(img, 12, 18, 11, 22, 0.3)
  scrapStem(img, 22, 11, 25, 9, -0.3)
  scrapStem(img, 8, 17, 13, 18, 0.5)
end)

layer(scraps, "Dry leaves", function(img)
  dryLeaf(img, 23.5, 15.0, { angle = 108, len = 6.2, width = 4.4, curl = 1.5 })
  dryLeaf(img, 7.5, 20.0, { angle = -152, len = 5.4, width = 3.8, curl = -1.2 })
end)

layer(scraps, "Leaves", function(img)
  -- 左上大叶
  scrapLeaf(img, 13.5, 13.5, { angle = -52, len = 9.5, width = 6.0, curl = 0.8 })
  -- 右上大叶
  scrapLeaf(img, 17.0, 14.0, { angle = 34, len = 9.0, width = 5.6, curl = -0.6 })
  -- 左下小叶
  scrapLeaf(img, 10.5, 15.5, { angle = -124, len = 7.2, width = 4.8, curl = 0.5 })
  -- 右下断叶
  scrapLeaf(img, 18.5, 16.5, { angle = 100, len = 7.2, width = 4.6, curl = 0.5 })
  -- 中间小叶：补芯
  scrapLeaf(img, 15.0, 15.0, { angle = 8, len = 6.0, width = 4.2, curl = 0.3 })
  -- 顶上小叶：破掉扇形
  scrapLeaf(img, 15.5, 11.0, { angle = -10, len = 5.4, width = 4.0, curl = 0.2 })
end)

-- 散落的碎叶：2–3 像素的小片，撑松轮廓
layer(scraps, "Fragments", function(img)
  for _, f in ipairs({ { 4, 11, 2 }, { 25, 18, 2 }, { 8, 25, 2 }, { 24, 7, 2 } }) do
    for k = 0, f[3] - 1 do
      img:drawPixel(f[1] + k, f[2], (k == 0) and C.leafSh or C.leafLit)
    end
  end
end)

save(scraps, "plant-scraps-32x32")

--[[ ------------------------------------------------------------------
     成熟堆肥
     ------------------------------------------------------------------ ]]
local compost = Sprite(IC, IC, ColorMode.RGB)

layer(compost, "Heap", function(img)
  -- 低矮土堆：顶缘不规则，底部铺开
  local rows = {
    { 14, 15, 17 },
    { 15, 13, 19 },
    { 16, 12, 21 },
    { 17, 10, 23 },
    { 18, 9,  24 },
    { 19, 8,  25 },
    { 20, 7,  26 },
    { 21, 7,  26 },
    { 22, 6,  27 },
    { 23, 6,  27 },
    { 24, 7,  26 },
    { 25, 8,  25 },
    { 26, 10, 23 },
  }
  for _, r in ipairs(rows) do
    for x = r[2], r[3] do
      img:drawPixel(x, r[1], C.compost)
    end
  end
  -- 顶面受光、堆脚压暗
  for x = 10, 23 do img:drawPixel(x, 17, C.compostLit) end
  -- 顶缘磕出两个小缺口，读成松散堆
  img:drawPixel(17, 13, C.compostDk)
  img:drawPixel(16, 14, C.compostRim)
  img:drawPixel(20, 15, C.compostRim)
  img:drawPixel(11, 16, C.compostRim)
  for x = 9, 24 do img:drawPixel(x, 18, C.compostLit) end
  for x = 8, 25 do img:drawPixel(x, 24, C.compostDk) end
  for x = 10, 23 do img:drawPixel(x, 25, C.compostDk) end

  -- 小团粒：压在主色上的 1–2 像素
  local crumbs = {
    { 11, 18 }, { 16, 19 }, { 21, 18 }, { 9, 21 }, { 13, 22 },
    { 18, 21 }, { 23, 21 }, { 15, 23 }, { 20, 24 }, { 12, 24 },
  }
  for i, c in ipairs(crumbs) do
    img:drawPixel(c[1], c[2], (i % 2 == 0) and C.crumb or C.crumbLit)
  end

  -- 碎纤维：几段短横线
  for _, f in ipairs({ { 12, 20, 3 }, { 19, 19, 2 }, { 15, 22, 4 }, { 8, 23, 2 }, { 22, 23, 2 } }) do
    for k = 0, f[3] - 1 do
      img:drawPixel(f[1] + k, f[2], C.fiber)
    end
  end

  -- 暖褐亮点：少量
  for _, w in ipairs({ { 17, 19 }, { 10, 22 }, { 22, 21 }, { 14, 20 } }) do
    img:drawPixel(w[1], w[2], C.warm)
    img:drawPixel(w[1] + 1, w[2], C.warmLit)
  end

  -- 松散边缘：主体外几粒散落的碎屑
  for _, c in ipairs({ { 8, 25 }, { 24, 25 }, { 26, 22 }, { 7, 19 }, { 14, 27 }, { 19, 27 }, { 5, 22 }, { 27, 23 }, { 4, 20 }, { 28, 20 } }) do
    img:drawPixel(c[1], c[2], C.compostDk)
  end
  for _, c in ipairs({ { 9, 26 }, { 23, 26 }, { 25, 24 }, { 6, 21 }, { 26, 19 }, { 5, 21 } }) do
    img:drawPixel(c[1], c[2], C.crumb)
  end
  -- 顶缘的碎纤维：横着卡在缺口里
  img:drawPixel(19, 13, C.fiber)
  img:drawPixel(20, 13, C.fiber)
  img:drawPixel(10, 15, C.fiber)
  -- 边缘几粒更亮的碎屑，拉开松散感
  img:drawPixel(3, 21, C.compostRim)
  img:drawPixel(28, 21, C.compostRim)
  img:drawPixel(13, 28, C.crumb)

  -- 整堆下缘与背光侧压深边
  for x = 6, 27 do
    local ymax = 0
    for y = 0, IC - 1 do
      if img:getPixel(x, y) ~= 0 then ymax = y end
    end
    if ymax > 0 then img:drawPixel(x, ymax, C.compostRim) end
  end
end)

save(compost, "compost-32x32")
