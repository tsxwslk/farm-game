-- 柳湾 · 紫苏四期生长
-- aseprite --batch --script draw-perilla.lua
-- 画布固定 48x72，根部固定 (24,66)，固定俯视微倾、左上受光。
-- 对生：每个节位左右各一片，成对镜像；相邻节位的角度逐层收窄，读成「错开的两层/三层」。
-- 叶片在俯视平面里建模，再按 k 压扁（越低越贴地）；整株外轮廓统一描一圈低饱和紫褐。
-- 只落整像素，不做抗锯齿。

local out = app.fs.filePath(debug.getinfo(1, "S").source:sub(2))
local OX, OY = 24, 66

local function rgba(hex)
  return app.pixelColor.rgba((hex >> 16) & 255, (hex >> 8) & 255, hex & 255, 255)
end

local C = {
  rim   = rgba(0x342329), -- 低饱和紫褐外轮廓
  deep  = rgba(0x3E2631),
  shade = rgba(0x4E2E3B),
  mid   = rgba(0x744050),
  plum  = rgba(0x95525E),
  lit   = rgba(0xB06A70),
  grey  = rgba(0xB08F9C), -- 受光叶面少量灰紫
  young = rgba(0xC0A5B2), -- 子叶与嫩叶淡紫
  stemD = rgba(0x4E3038),
  stem  = rgba(0x64404A),
  stemL = rgba(0x7A505A),
}

local RAMP = { C.deep, C.shade, C.mid, C.plum, C.lit }
local YOUNG_RAMP = { C.shade, C.mid, C.plum, C.lit, C.grey }
local SEED_RAMP = { C.mid, C.plum, C.lit, C.grey, C.young }

local LX, LY = -0.70710678, -0.70710678

local solidSet = {}

local function put(img, x, y, color)
  if x >= 0 and x < 48 and y >= 0 and y <= OY then
    img:drawPixel(x, y, color)
    solidSet[y * 48 + x] = true
  end
end

-- 一片对生叶：宽卵形、尖头、粗锯齿
-- cfg: angle(0=正北) / len / width / k / teeth / toothDepth / ramp / grey
local function leaf(img, ox, oy, cfg)
  local a = math.rad(cfg.angle)
  local dx, dy = math.sin(a), -math.cos(a)
  local px, py = -dy, dx
  local k = cfg.k or 0.75
  local pet = cfg.pet or 2.6
  local len, width = cfg.len, cfg.width
  local ramp = cfg.ramp or RAMP
  local teeth = cfg.teeth or 0
  local depth = cfg.toothDepth or 0.12

  -- 压缩后的光向，保证明暗和画面对得上
  local vignette = cfg.grey
  local lx, ly = LX, LY / k
  local ln = math.sqrt(lx * lx + ly * ly)
  lx, ly = lx / ln, ly / ln
  local lu, lv = lx * dx + ly * dy, lx * px + ly * py
  local vs = (lv >= 0) and 1 or -1

  local spanU = len + pet + 1
  local spanV = width * 0.6 + 1
  local ex = spanU * math.abs(dx) + spanV * math.abs(px) + 1
  local ey = (spanU * math.abs(dy) + spanV * math.abs(py)) * k + 1

  for yy = math.max(0, math.floor(oy - ey)), math.min(OY, math.ceil(oy + ey)) do
    local wy = (yy - oy) / k
    for xx = math.max(0, math.floor(ox - ex)), math.min(47, math.ceil(ox + ex)) do
      local rx, ry = xx - ox, wy
      local u = rx * dx + ry * dy
      local v = rx * px + ry * py
      if u >= 0 and u <= pet then
        -- 短叶柄：深紫褐，窄
        if math.abs(v) <= 1.05 then
          put(img, xx, yy, (v > 0) and C.stemD or C.stem)
        end
      elseif u > pet and u <= pet + len then
        local s = (u - pet) / len
        local body = math.sin(math.pi * (0.03 + 0.97 * s) ^ 0.72) ^ 0.60
        -- 叶尖：从 55% 起持续收窄，收成尖头
        if s > 0.74 then body = body * (1 - ((s - 0.74) / 0.26) ^ 1.30) end
        local tooth = 1
        if teeth > 0 and s > 0.28 then
          local phase = (((s - 0.28) / 0.72) * teeth) % 1
          tooth = (phase < 0.55) and 1 or (1 - depth)
        end
        local hw = math.max(0.5, width * 0.5 * body * tooth)
        if math.abs(v) <= hw then
          local across = v / hw
          local b = (0.50 + 0.60 * (lu * (s - 0.46) + lv * across * 0.9)) * (cfg.bright or 1)
          if cfg.grey and across < -0.15 and s > 0.30 then b = b + 0.06 end
          local level = b < 0.40 and 1 or b < 0.56 and 2 or b < 0.72 and 3 or b < 0.86 and 4 or 5
          local tone = ramp[level]
          -- 主脉：一像素浅一档，从柄一直通到叶尖前
          if math.abs(v) < 0.62 and s < 0.86 then
            tone = ramp[math.min(5, level + 1)]
          end
          -- 受光侧的叶缘勾一像素，把叠在一起的叶子分开
          if across < -0.80 and s > 0.30 and s < 0.66 then
            tone = (cfg.grey and level >= 4) and C.grey or ramp[math.min(5, level + 1)]
          end
          put(img, xx, yy, tone)
        end
      end
    end
  end
end

-- 短茎：贴根部的一段紫褐柱，左右各一档受光
local function stem(img, topY, width)
  for y = topY, OY do
    local t = (y - topY) / math.max(1, OY - topY)
    local hw = width * 0.5 * (0.92 + 0.08 * t)
    for x = math.floor(OX - hw + 0.5), math.floor(OX + hw) do
      local rel = (x - OX + 0.5) / hw
      local tone = C.stem
      if rel < -0.35 then
        tone = C.stemL
      elseif rel > 0.45 then
        tone = C.stemD
      end
      put(img, x, y, tone)
    end
  end
end

local function layer(sprite, name, draw)
  local target = sprite:newLayer()
  target.name = name
  local pixels = Image(sprite.width, sprite.height, ColorMode.RGB)
  draw(pixels)
  sprite:newCel(target, 1, pixels, Point(0, 0))
end

local function save(sprite, name)
  local pivot = sprite:newSlice(Rectangle(0, 0, sprite.width, sprite.height))
  pivot.name = "Placement"
  pivot.pivot = Point(OX, OY)
  assert(sprite:saveAs(app.fs.joinPath(out, name .. ".aseprite")))
  assert(sprite:saveCopyAs(app.fs.joinPath(out, name .. ".png")))
  sprite:close()
  print("Exported " .. name)
end

-- 外轮廓：只描和画面外连通的那圈；叶间缝隙保持透明，不要填死
local function outline(img)
  local outside, queue = {}, {}
  local function push(x, y)
    local key = y * 48 + x
    if x >= 0 and x < 48 and y >= 0 and y < 72 and not solidSet[key] and not outside[key] then
      outside[key] = true
      queue[#queue + 1] = { x, y }
    end
  end
  for i = 0, 47 do
    push(i, 0); push(i, 71); push(0, i); push(47, i)
  end
  local head = 1
  while head <= #queue do
    local c = queue[head]; head = head + 1
    push(c[1] - 1, c[2]); push(c[1] + 1, c[2]); push(c[1], c[2] - 1); push(c[1], c[2] + 1)
  end

  for key in pairs(solidSet) do
    local x, y = key % 48, math.floor(key / 48)
    for _, n in ipairs({ { x - 1, y }, { x + 1, y }, { x, y - 1 }, { x, y + 1 } }) do
      -- 根部那一行及以下不描边，保证接地点仍是 (24,66)
      if n[1] >= 0 and n[1] < 48 and n[2] >= 0 and n[2] <= OY and outside[n[2] * 48 + n[1]] then
        img:drawPixel(n[1], n[2], C.rim)
      end
    end
  end
end

local function stage(name, spec)
  solidSet = {}
  local sprite = Sprite(48, 72, ColorMode.RGB)
  layer(sprite, "Stem", function(img) stem(img, spec.stemTop, spec.stemW or 3) end)
  for i, pair in ipairs(spec.pairs) do
    layer(sprite, "Pair " .. i, function(img)
      leaf(img, OX - 1.4, pair.y, { angle = -pair.angle, len = pair.len, width = pair.width,
        k = pair.k, teeth = pair.teeth, toothDepth = pair.depth, ramp = pair.ramp, grey = pair.grey,
        bright = pair.bright })
      leaf(img, OX + 1.4, pair.y, { angle = pair.angle, len = pair.len, width = pair.width,
        k = pair.k, teeth = pair.teeth, toothDepth = pair.depth, ramp = pair.ramp, grey = pair.grey,
        bright = pair.bright })
    end)
  end
  layer(sprite, "Outline", function(img) outline(img) end)
  save(sprite, name)
end

--[[ 01 刚出土：两片短圆子叶，带淡紫 ]]--
stage("01-sprout", {
  stemTop = 61, stemW = 2,
  pairs = {
    { y = 62, angle = 62, len = 6.5, width = 7.5, k = 1.00, teeth = 0, ramp = SEED_RAMP, bright = 1.04 },
  },
})

--[[ 02 幼苗：第一对宽卵形真叶 ]]--
stage("02-seedling", {
  stemTop = 57, stemW = 2,
  pairs = {
    { y = 59, angle = 68, len = 10, width = 9.5, k = 0.98, teeth = 3, depth = 0.22, ramp = YOUNG_RAMP, grey = true },
  },
})

--[[ 03 中期：两层错开的对生叶 + 紫褐短茎 ]]--
stage("03-bulking", {
  stemTop = 52, stemW = 3,
  pairs = {
    { y = 63, angle = 80, len = 13, width = 11.0, k = 0.94, teeth = 3, depth = 0.26 },
    { y = 55, angle = 42, len = 10, width = 9.0, k = 0.98, teeth = 3, depth = 0.24, grey = true },
  },
})

--[[ 04 成熟：三层宽叶，尖头粗锯齿 ]]--
stage("04-mature", {
  stemTop = 44, stemW = 3,
  pairs = {
    { y = 63, angle = 68, len = 18, width = 11.5, k = 0.96, bright = 1.00, teeth = 3, depth = 0.28 },
    { y = 54, angle = 46, len = 16, width = 11.0, k = 0.99, bright = 1.06, teeth = 3, depth = 0.26 },
    { y = 45, angle = 22, len = 14, width = 10.0, k = 1.00, bright = 1.12, teeth = 3, depth = 0.24, grey = true },
  },
})


--[[ 05 背包收获图：一小把紫苏叶，32×32 ]]--
local IC = 32
local iconSolid = {}

local IX, IY = 1, -3 -- 整枚图案平移，居中留边

local function iput(img, x, y, color)
  x = x + IX
  y = y + IY
  if x >= 0 and x < IC and y >= 0 and y < IC then
    img:drawPixel(x, y, color)
    iconSolid[y * IC + x] = true
  end
end

-- 一片摘下来的叶：任意着生点，宽卵形、尖头、几处粗锯齿
local function ileaf(img, ox, oy, cfg)
  local a = math.rad(cfg.angle)
  local dx, dy = math.sin(a), -math.cos(a)
  local px, py = -dy, dx
  local len, width = cfg.len, cfg.width
  local ramp = cfg.ramp
  local teeth = cfg.teeth or 3
  local depth = cfg.depth or 0.26
  local curl = cfg.curl or 0

  local lu = LX * dx + LY * dy
  local lv = LX * px + LY * py
  local vs = (lv >= 0) and 1 or -1

  for yy = math.floor(oy - len - width) - 1, math.ceil(oy + width) + 1 do
    for xx = math.floor(ox - len - width) - 1, math.ceil(ox + len + width) + 1 do
      local rx, ry = xx - ox, yy - oy
      local u = rx * dx + ry * dy
      if u >= 0 and u <= len then
        local s = u / len
        local body = math.sin(math.pi * (0.04 + 0.96 * s) ^ 0.74) ^ 0.62
        if s > 0.70 then body = body * (1 - ((s - 0.70) / 0.30) ^ 1.25) end
        local tooth = 1
        if s > 0.30 then
          local phase = (((s - 0.30) / 0.70) * teeth) % 1
          tooth = (phase < 0.58) and 1 or (1 - depth)
        end
        local hw = math.max(0.5, width * 0.5 * body * tooth)
        local v = (rx * px + ry * py) - curl * s * s
        if math.abs(v) <= hw then
          local across = v / hw
          local b = 0.64 + 0.42 * (lu * (s - 0.46) + lv * across * 0.9)
          local level = b < 0.40 and 1 or b < 0.56 and 2 or b < 0.72 and 3 or b < 0.88 and 4 or 5
          iput(img, xx, yy, ramp[level])
        end
      end
    end
  end
end

-- 短柄：切下来的一小段
local function istem(img, x0, y0, x1, y1, w)
  local dx, dy = x1 - x0, y1 - y0
  local len = math.sqrt(dx * dx + dy * dy)
  dx, dy = dx / len, dy / len
  local px, py = -dy, dx
  for yy = math.floor(math.min(y0, y1)) - 2, math.ceil(math.max(y0, y1)) + 2 do
    for xx = math.floor(math.min(x0, x1)) - 2, math.ceil(math.max(x0, x1)) + 2 do
      local rx, ry = xx - x0, yy - y0
      local u = rx * dx + ry * dy
      if u >= 0 and u <= len then
        local v = rx * px + ry * py
        if math.abs(v) <= w * 0.5 then
          iput(img, xx, yy, (v > 0.3) and C.stemD or C.stemL)
        end
      end
    end
  end
end

local PLUM_ICON = {
  app.pixelColor.rgba(0x55, 0x30, 0x3C, 255),
  app.pixelColor.rgba(0x6B, 0x3A, 0x48, 255),
  app.pixelColor.rgba(0x86, 0x48, 0x53, 255),
  app.pixelColor.rgba(0xA0, 0x5A, 0x63, 255),
  app.pixelColor.rgba(0xB8, 0x7A, 0x7E, 255),
}
local UNDER_ICON = {
  app.pixelColor.rgba(0x70, 0x57, 0x61, 255),
  app.pixelColor.rgba(0x88, 0x70, 0x7A, 255),
  app.pixelColor.rgba(0x9F, 0x88, 0x92, 255),
  app.pixelColor.rgba(0xB5, 0xA0, 0xA9, 255),
  app.pixelColor.rgba(0xC8, 0xB6, 0xBD, 255),
}

local icon = Sprite(IC, IC, ColorMode.RGB)

layer(icon, "Leaves", function(img)
  -- 后面一片：翻过来的灰紫背面，向左上
  ileaf(img, 14.2, 24.0, { angle = -44, len = 17, width = 11.8, ramp = UNDER_ICON, curl = -0.7, depth = 0.28 })
  -- 前面一片：深李紫正面，偏直略左倾，压住后叶下半
  ileaf(img, 16.0, 27.2, { angle = 18, len = 22, width = 14.5, ramp = PLUM_ICON, curl = 0.4, depth = 0.26 })
end)

layer(icon, "Stem", function(img)
  istem(img, 14.6, 29.6, 16.6, 27.0, 2.4)
end)

layer(icon, "Outline", function(img)
  local outside, queue = {}, {}
  local function push(x, y)
    local key = y * IC + x
    if x >= 0 and x < IC and y >= 0 and y < IC and not iconSolid[key] and not outside[key] then
      outside[key] = true
      queue[#queue + 1] = { x, y }
    end
  end
  for i = 0, IC - 1 do
    push(i, 0); push(i, IC - 1); push(0, i); push(IC - 1, i)
  end
  local head = 1
  while head <= #queue do
    local c = queue[head]; head = head + 1
    push(c[1] - 1, c[2]); push(c[1] + 1, c[2]); push(c[1], c[2] - 1); push(c[1], c[2] + 1)
  end
  -- 叶与叶之间被围住的透明小洞补成暗紫，读成叶缝的阴影
  for y = 0, IC - 1 do
    for x = 0, IC - 1 do
      local key = y * IC + x
      if not iconSolid[key] and not outside[key] then
        img:drawPixel(x, y, C.deep)
      end
    end
  end
  for key in pairs(iconSolid) do
    local x, y = key % IC, math.floor(key / IC)
    for _, n in ipairs({ { x - 1, y }, { x + 1, y }, { x, y - 1 }, { x, y + 1 } }) do
      if n[1] >= 0 and n[1] < IC and n[2] >= 0 and n[2] < IC and outside[n[2] * IC + n[1]] then
        img:drawPixel(n[1], n[2], C.rim)
      end
    end
  end
end)

assert(icon:saveAs(app.fs.joinPath(out, "05-inventory.aseprite")))
assert(icon:saveCopyAs(app.fs.joinPath(out, "05-inventory.png")))
icon:close()
print("Exported 05-inventory")

print("done")
