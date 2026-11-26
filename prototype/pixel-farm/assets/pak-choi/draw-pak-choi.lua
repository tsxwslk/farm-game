-- 柳湾 · 小白菜四期生长
-- aseprite --batch --script draw-pak-choi.lua
-- 画布固定 48x72，根部固定 (24,66)，左上受光。
-- 叶片在「俯视平面」里建模，再按 k 压扁：平铺叶 k 小（贴地），立起叶 k 大。
-- 先铺全部乳白叶柄，再压叶片：白只在叶缝间露出，读成汇聚的叶柄而不是白碗。
-- 只落整像素，不做抗锯齿。

local out = app.fs.filePath(debug.getinfo(1, "S").source:sub(2))
local OX, OY = 24, 66

local function rgba(hex)
  return app.pixelColor.rgba((hex >> 16) & 255, (hex >> 8) & 255, hex & 255, 255)
end

local C = {
  rim   = rgba(0x22362C), -- 本色深边（不是黑）
  deep  = rgba(0x2C4838),
  shade = rgba(0x385C44),
  mid   = rgba(0x47764F),
  light = rgba(0x5F9159),
  lit   = rgba(0x7CAD68),
  fresh = rgba(0x9CCA7A), -- 子叶顶光
  petRim   = rgba(0x7E9580),
  petShade = rgba(0x9AB297), -- 乳白带浅青的暗面
  pet      = rgba(0xBCCFB0),
  petLit   = rgba(0xD6E3C6),
}

local function ramp(tones, rim)
  return { tones = tones, rim = rim }
end

local MATURE = ramp({ C.deep, C.shade, C.mid, C.light, C.lit }, C.rim)
local YOUNG  = ramp({ C.shade, C.mid, C.light, C.lit, C.fresh }, C.deep)
local FRESH  = ramp({ C.mid, C.light, C.lit, C.fresh, C.fresh }, C.shade)

local function dimmed(set, steps)
  local tones = {}
  for i = 1, 5 do tones[i] = set.tones[math.max(1, i - steps)] end
  return { tones = tones, rim = C.deep }
end

local LX, LY = -0.70710678, -0.70710678

-- 一片叶：乳白叶柄 + 圆钝叶身
-- cfg: angle(0=正北) / petLen / petW / bladeLen / bladeW / curl / k / set / part("stem"|"blade")
local function leaf(img, cfg)
  local a = math.rad(cfg.angle or 0)
  local dx, dy = math.sin(a), -math.cos(a)
  local px, py = -dy, dx
  local k = cfg.k or 0.72
  local part = cfg.part

  local lx, ly = LX, LY / k
  local ln = math.sqrt(lx * lx + ly * ly)
  lx, ly = lx / ln, ly / ln
  local lu, lv = lx * dx + ly * dy, lx * px + ly * py
  local vs = (lv >= 0) and 1 or -1

  local plen, pw = cfg.petLen, cfg.petW
  local blen, bw = cfg.bladeLen, cfg.bladeW
  local curl = cfg.curl or 0
  local total = plen + blen
  local set = cfg.set

  local spanU = total + 1
  local spanV = bw * 0.55 + 1
  local ex = spanU * math.abs(dx) + spanV * math.abs(px) + 1
  local ey = (spanU * math.abs(dy) + spanV * math.abs(py)) * k + 1

  for yy = math.max(0, math.floor(OY - ey)), math.min(OY - 1, math.ceil(OY + ey)) do
    local wy = (yy - OY) / k
    for xx = math.max(0, math.floor(OX - ex)), math.min(47, math.ceil(OX + ex)) do
      local wx = xx - OX
      local u = wx * dx + wy * dy
      if u >= 0 and u <= total then
        local v = (wx * px + wy * py) - curl * (u / total) ^ 2
        if u <= plen then
          if part ~= "blade" then
            local p = u / math.max(1, plen)
            local hw = pw * 0.5 * (0.70 + 0.30 * p)
            if p < 0.14 then hw = hw * (0.55 + 0.45 * (p / 0.14)) end
            if math.abs(v) <= hw then
              local along = v * vs
              local tone = C.pet
              if along > hw - 1.1 then
                tone = C.petLit
              elseif along < -hw * 0.15 then
                tone = C.petShade
              end
              if along < -hw + 1.0 then tone = C.petRim end
              img:drawPixel(xx, yy, tone)
            end
          end
        elseif part ~= "stem" then
          local s = (u - plen) / blen
          local body = math.sqrt(math.max(0, 1 - s ^ 3.2))
          local neck = 0.52 + 0.48 * math.min(1, s / 0.22)
          local hw = math.max(0.5, bw * 0.5 * body * neck)
          if math.abs(v) <= hw then
            local across = v / hw
            local b = 0.62 + 0.42 * (lu * (s - 0.42) + lv * across * 0.9)
            local edge = hw - math.abs(v)
            if edge < 1.0 then b = b - 0.10 * (1.0 - edge) end
            local level = b < 0.42 and 2 or b < 0.66 and 3 or 4
            local tone = set.tones[level]
            local along = v * vs
            if edge < 0.85 and along < 0 then tone = set.rim end
            img:drawPixel(xx, yy, tone)
          end
        end
      end
    end
  end
end

-- 基部：手写的乳白叶柄束（三条瓣、带缝、落地行压暗）
-- rows 自上而下的半宽，末行为接地行
local function base(img, rows)
  local y0 = OY - #rows + 1
  for i, hw in ipairs(rows) do
    local y = y0 + i - 1
    for x = OX - hw, OX + hw - 1 do
      local rel = (x - OX + 0.5) / hw
      local tone
      if rel > 0.72 then
        tone = (hw >= 2) and C.petRim or C.petShade
      elseif rel > 0.26 then
        tone = C.petShade
      elseif rel < -0.58 then
        tone = C.petLit
      else
        tone = C.pet
      end
      if x == OX - 2 or x == OX + 2 then tone = C.petRim end
      if y == OY then tone = C.petShade end
      img:drawPixel(x, y, tone)
    end
  end
end

-- 基部叶柄：三根扇开的乳白短柄（左中右各一），叶片刻意压住梢头
local function stalkFan(img, spec)
  for _, item in ipairs(spec) do
    local a = math.rad(item[1])
    local dx, dy = math.sin(a), -math.cos(a)
    local px, py = -dy, dx
    local len, w = item[2], item[3]
    local reach = len + 2
    for yy = math.floor(OY - reach) - 1, OY do
      if yy >= 0 then
        for xx = math.floor(OX - reach) - 1, math.ceil(OX + reach) do
          if xx >= 0 and xx <= 47 then
            local u = (xx - OX) * dx + (yy - OY) * dy
            if u >= 0 and u <= len then
              local hw = (w * 0.5) * (0.55 + 0.45 * (u / len))
              local v = (xx - OX) * px + (yy - OY) * py
              if math.abs(v) <= hw then
                local rel = v / hw
                local tone = C.pet
                if rel > 0.35 then tone = C.petShade end
                if rel < -0.45 then tone = C.petLit end
                if math.abs(math.abs(rel) - 1) < 0.25 then tone = C.petRim end
                img:drawPixel(xx, yy, tone)
              end
            end
          end
        end
      end
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

-- 叶片分组，先茎后叶；同组内按列表顺序压叠
local GROUPS = { "back", "mid", "petiole", "heart", "front" }

local function stage(fileName, leaves, baseRows, stalks)
  local sprite = Sprite(48, 72, ColorMode.RGB)
  layer(sprite, "Base", function(img) base(img, baseRows) end)
  for _, group in ipairs(GROUPS) do
    if group == "petiole" then
      if stalks and #stalks > 0 then
        layer(sprite, "Petioles", function(img) stalkFan(img, stalks) end)
      end
    else
      local any = false
      for _, cfg in ipairs(leaves) do
        if cfg.group == group then any = true end
      end
      if any then
        layer(sprite, "Leaves " .. group, function(img)
          for _, cfg in ipairs(leaves) do
            if cfg.group == group then
              cfg.part = "blade"
              leaf(img, cfg)
            end
          end
        end)
      end
    end
  end
  save(sprite, fileName)
end

--[[ 01 刚出土：两片圆短子叶 ]]--
stage("01-sprout", {
  { group = "back", angle = -44, petLen = 3, petW = 2, bladeLen = 10, bladeW = 10, curl = -0.6, k = 0.95, set = FRESH },
  { group = "back", angle = 46, petLen = 3, petW = 2, bladeLen = 10, bladeW = 10, curl = 0.6, k = 0.95, set = dimmed(FRESH, 1) },
}, {1,2}, {{0, 3, 3}})

--[[ 02 幼苗：四片浅绿真叶 + 短浅色叶柄 ]]--
stage("02-seedling", {
  { group = "back", angle = -64, petLen = 3, petW = 2, bladeLen = 12, bladeW = 11, curl = -0.9, k = 0.88, set = dimmed(YOUNG, 1) },
  { group = "back", angle = 66, petLen = 3, petW = 2, bladeLen = 12, bladeW = 11, curl = 0.9, k = 0.88, set = dimmed(YOUNG, 1) },
  { group = "front", angle = -30, petLen = 4, petW = 2, bladeLen = 12, bladeW = 11, curl = -0.4, k = 0.90, set = YOUNG },
  { group = "front", angle = 32, petLen = 4, petW = 2, bladeLen = 12, bladeW = 11, curl = 0.4, k = 0.90, set = YOUNG },
}, {1,2,3,2}, {{-46, 4, 3}, {2, 5, 3}, {46, 4, 3}})

--[[ 03 中期：向两侧展开的低矮莲座，叶柄明显 ]]--
stage("03-bulking", {
  { group = "back", angle = -84, petLen = 5, petW = 2, bladeLen = 17, bladeW = 12, curl = -1.0, k = 0.62, set = dimmed(MATURE, 1) },
  { group = "back", angle = 86, petLen = 5, petW = 2, bladeLen = 17, bladeW = 12, curl = 1.0, k = 0.62, set = dimmed(MATURE, 1) },
  { group = "mid", angle = -52, petLen = 4, petW = 2, bladeLen = 18, bladeW = 12, curl = -1.0, k = 0.78, set = MATURE },
  { group = "mid", angle = 54, petLen = 4, petW = 2, bladeLen = 18, bladeW = 12, curl = 1.0, k = 0.78, set = MATURE },
  { group = "front", angle = -30, petLen = 5, petW = 4, bladeLen = 15, bladeW = 11, curl = -0.4, k = 0.84, set = MATURE },
  { group = "front", angle = 28, petLen = 5, petW = 4, bladeLen = 15, bladeW = 11, curl = 0.4, k = 0.84, set = MATURE },
}, {1,2,2,2}, {{-58, 4, 3}, {0, 4, 3}, {58, 4, 3}})

--[[ 04 成熟：中心叶略立起，整株松散叶丛 ]]--
stage("04-mature", {
  { group = "back", angle = -80, petLen = 5, petW = 2, bladeLen = 16, bladeW = 12, curl = -1.2, k = 0.62, set = dimmed(MATURE, 1) },
  { group = "back", angle = 82, petLen = 5, petW = 2, bladeLen = 16, bladeW = 12, curl = 1.2, k = 0.62, set = dimmed(MATURE, 1) },
  { group = "mid", angle = -46, petLen = 4, petW = 2, bladeLen = 20, bladeW = 12, curl = -1.4, k = 0.72, set = MATURE },
  { group = "mid", angle = 48, petLen = 4, petW = 2, bladeLen = 20, bladeW = 12, curl = 1.4, k = 0.72, set = MATURE },
  { group = "front", angle = -34, petLen = 6, petW = 5, bladeLen = 20, bladeW = 13, curl = -0.5, k = 0.86, set = MATURE },
  { group = "front", angle = 32, petLen = 6, petW = 5, bladeLen = 20, bladeW = 13, curl = 0.5, k = 0.86, set = MATURE },
  { group = "heart", angle = -2, petLen = 8, petW = 5, bladeLen = 17, bladeW = 13, curl = 1.2, k = 1.00, set = MATURE },
}, {1,2,2,3,2}, {{-62, 5, 3}, {0, 5, 3}, {62, 5, 3}})

--[[ 05 背包收获物：一株斜放的小白菜，乳白叶柄收成根颈，短切口朝下 ]]--
local IC = 32
local bone = app.pixelColor.rgba(0xED, 0xF1, 0xDA, 255)

local solidSet = {}

local function iput(img, x, y, color)
  if x >= 0 and x < IC and y >= 0 and y < IC then
    img:drawPixel(x, y, color)
    solidSet[y * IC + x] = true
  end
end

-- 一段从根部收拢的叶柄：靠近根颈窄、靠近叶片宽
local function lstalk(img, x0, y0, x1, y1, w0, w1)
  local dx, dy = x1 - x0, y1 - y0
  local len = math.sqrt(dx * dx + dy * dy)
  dx, dy = dx / len, dy / len
  local px, py = -dy, dx
  local lv = LX * px + LY * py
  local vs = (lv >= 0) and 1 or -1
  local reach = math.max(w0, w1) * 0.6 + 1
  for y = math.floor(math.min(y0, y1) - reach), math.ceil(math.max(y0, y1) + reach) do
    for x = math.floor(math.min(x0, x1) - reach), math.ceil(math.max(x0, x1) + reach) do
      local rx, ry = x - x0, y - y0
      local u = rx * dx + ry * dy
      if u >= 0 and u <= len then
        local hw = (w0 + (w1 - w0) * (u / len)) * 0.5
        local v = rx * px + ry * py
        if math.abs(v) <= hw then
          local along = v * vs
          local tone = C.pet
          if along > hw * 0.10 then
            tone = bone
          elseif along < -hw * 0.35 then
            tone = C.petShade
          end
          iput(img, x, y, tone)
        end
      end
    end
  end
end

-- 斜看的短切口：一枚扁椭圆
local function lcut(img, cx, cy, rx, ry)
  for y = math.floor(cy - ry - 1), math.ceil(cy + ry + 1) do
    for x = math.floor(cx - rx - 1), math.ceil(cx + rx + 1) do
      local nx, ny = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
      if nx * nx + ny * ny <= 1 then
        local tone = C.pet
        if nx < -0.30 then
          tone = bone
        elseif nx > 0.40 or ny > 0.50 then
          tone = C.petShade
        end
        if ny > 0.80 then tone = C.petRim end
        iput(img, x, y, tone)
      end
    end
  end
end

-- 只在乳白区内画分缝线，不越界
local function paleLine(img, x0, y0, x1, y1, color)
  local steps = math.max(math.abs(x1 - x0), math.abs(y1 - y0))
  for i = 0, math.floor(steps) do
    local t = (steps == 0) and 0 or (i / steps)
    local x = math.floor(x0 + (x1 - x0) * t + 0.5)
    local y = math.floor(y0 + (y1 - y0) * t + 0.5)
    if x >= 0 and x < IC and y >= 0 and y < IC and solidSet[y * IC + x] then
      img:drawPixel(x, y, color)
    end
  end
end

-- 一片叶身（不带叶柄，方向 0 = 正上）
local function lleaf(img, ox, oy, angle, len, width, set, curl)
  local a = math.rad(angle)
  local dx, dy = math.sin(a), -math.cos(a)
  local px, py = -dy, dx
  local lu, lv = LX * dx + LY * dy, LX * px + LY * py
  local vs = (lv >= 0) and 1 or -1
  local reach = len + width
  for y = math.floor(oy - reach), math.ceil(oy + reach) do
    for x = math.floor(ox - reach), math.ceil(ox + reach) do
      local rx, ry = x - ox, y - oy
      local u = rx * dx + ry * dy
      if u >= 0 and u <= len then
        local s = u / len
        local body = math.sqrt(math.max(0, 1 - s ^ 3.2))
        local neck = 0.52 + 0.48 * math.min(1, s / 0.22)
        local hw = math.max(0.5, width * 0.5 * body * neck)
        local v = (rx * px + ry * py) - curl * s * s
        if math.abs(v) <= hw then
          local across = v / hw
          local b = 0.62 + 0.42 * (lu * (s - 0.42) + lv * across * 0.9)
          local edge = hw - math.abs(v)
          if edge < 1.0 then b = b - 0.10 * (1.0 - edge) end
          local level = b < 0.42 and 2 or b < 0.66 and 3 or 4
          local tone = set.tones[level]
          local along = v * vs
          if edge < 0.85 and along < 0 then tone = set.rim end
          iput(img, x, y, tone)
        end
      end
    end
  end
end

local icon = Sprite(IC, IC, ColorMode.RGB)

layer(icon, "Stalks", function(img)
  local rows = { 3.6, 4.6, 5.0, 4.8, 4.4, 4.0, 3.6, 3.2, 2.8, 2.6 }
  for i, hw in ipairs(rows) do
    local y = 17 + i
    for x = math.floor(16 - hw + 0.5), math.floor(16 + hw) do
      local rel = (x - 16 + 0.5) / hw
      local tone = C.pet
      if rel < -0.10 then
        tone = bone
      elseif rel > 0.45 then
        tone = C.petShade
      end
      iput(img, x, y, tone)
    end
  end
  lcut(img, 16.0, 27.6, 3.0, 1.2)
  paleLine(img, 14.4, 26.4, 14.8, 21.0, C.petShade)
  paleLine(img, 17.6, 26.4, 17.2, 21.0, C.petShade)
end)

layer(icon, "Leaves", function(img)
  lleaf(img, 12.4, 19.8, -52, 11.5, 10.2, dimmed(MATURE, 1), -0.9)
  lleaf(img, 19.8, 20.0, 52, 9, 9.0, MATURE, 1.0)
  lleaf(img, 16.0, 19.2, -2, 13, 11.0, MATURE, 0.3)
end)

layer(icon, "Outline", function(img)
  -- 从画布四周泛洪，只有和外界连通的透明像素才描边；内部小洞直接补乳白
  local outside = {}
  local queue = {}
  local function push(x, y)
    local key = y * IC + x
    if x >= 0 and x < IC and y >= 0 and y < IC and not solidSet[key] and not outside[key] then
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
  for y = 0, IC - 1 do
    for x = 0, IC - 1 do
      local key = y * IC + x
      if not solidSet[key] and not outside[key] then
        img:drawPixel(x, y, C.pet)
        solidSet[key] = true
      end
    end
  end
  for key in pairs(solidSet) do
    local x, y = key % IC, math.floor(key / IC)
    local neighbours = { { x - 1, y }, { x + 1, y }, { x, y - 1 }, { x, y + 1 } }
    for _, n in ipairs(neighbours) do
      if n[1] >= 0 and n[1] < IC and n[2] >= 0 and n[2] < IC then
        local k = n[2] * IC + n[1]
        if outside[k] then img:drawPixel(n[1], n[2], C.rim) end
      end
    end
  end
end)

assert(icon:saveAs(app.fs.joinPath(out, "05-inventory.aseprite")))
assert(icon:saveCopyAs(app.fs.joinPath(out, "05-inventory.png")))
icon:close()
print("Exported 05-inventory")

print("done")