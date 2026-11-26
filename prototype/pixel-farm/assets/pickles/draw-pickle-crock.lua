-- 敞口矮陶罐（腌菜用）32×32，Aseprite 批处理：
--   "D:\Aseprite\aseprite.exe" --batch --script draw-pickle-crock.lua
-- 两层同画布：
--   base-32x32  罐身、罐口后沿、口内井壁与少量盐水
--   rim-32x32   只画罐口前沿 y16..18，盖住作物图下缘
-- 作物收获图 18×18 放在 (7,1)，界于两层之间。
-- 微俯视、左上受光：口沿环面琥珀釉，右侧压暗，罐身暖褐陶，左上肩一段釉痕。
local output = app.fs.filePath(debug.getinfo(1, "S").source:sub(2))
local palette = {
  dark    = 0x3F2110, -- 本色深边与口内深处
  clay_sh = 0x6A3B22, -- 陶身暗面、内壁阴影
  clay    = 0x8C5230, -- 陶身主色
  clay_hi = 0xB4703C, -- 陶身受光
  glaze_d = 0xA9662F, -- 釉的暗面
  glaze   = 0xD89050, -- 琥珀釉
  glaze_h = 0xEFB268, -- 釉的高光
  brine   = 0xC4914F, -- 淡琥珀色盐水
  brine_h = 0xE3B76E, -- 盐水反光
}

for name, rgb in pairs(palette) do
  palette[name] = app.pixelColor.rgba((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, 255)
end

local function span(image, y, left, right, tone)
  for x = left, right do
    image:drawPixel(x, y, palette[tone])
  end
end

local function layer(sprite, name, draw)
  local target = sprite:newLayer()
  target.name = name
  local pixels = Image(sprite.width, sprite.height, ColorMode.RGB)
  draw(pixels)
  sprite:newCel(target, 1, pixels, Point(0, 0))
end

-- 口沿是平放的环面，明暗按绝对横坐标分档；罐身是曲面，按本行宽度分档
local function ringTone(x)
  local t = (x - 2) / 27
  if t < 0.30 then return "glaze_h" end
  if t < 0.76 then return "glaze" end
  return "glaze_d"
end

local function bodyTone(x, left, right)
  local t = (x - left) / math.max(1, right - left)
  if t < 0.46 then return "clay_hi" end
  if t < 0.82 then return "clay" end
  return "clay_sh"
end

-- y, 外沿左, 外沿右, 口内左, 口内右（口内为 0 表示该行已收口）
local rows = {
  { 8, 11, 20,  0,  0},
  { 9,  8, 23, 14, 17},
  {10,  5, 26, 12, 19},
  {11,  3, 28,  9, 22},
  {12,  2, 29,  7, 24},
  {13,  2, 29,  7, 24},
  {14,  2, 29,  9, 22},
  {15,  3, 28, 12, 19},
  {16,  4, 27,  0,  0},
  {17,  4, 27,  0,  0},
  {18,  5, 26,  0,  0},
  {19,  5, 26,  0,  0},
  {20,  5, 26,  0,  0},
  {21,  6, 25,  0,  0},
  {22,  6, 25,  0,  0},
  {23,  6, 25,  0,  0},
  {24,  7, 24,  0,  0},
  {25,  8, 23,  0,  0},
  {26,  8, 23,  0,  0},
  {27,  9, 22,  0,  0},
  {28, 10, 21,  0,  0},
  {29, 11, 20,  0,  0},
}

-- 盐水只铺在口内下半的一小块，四周留出井壁的暗面
local pool = {
  [13] = { 10, 21},
  [14] = { 11, 20},
  [15] = { 13, 18},
}

-- ---------- 底层 ----------
local base = Sprite(32, 32, ColorMode.RGB)

layer(base, "Jar base", function(image)
  for _, row in ipairs(rows) do
    local y, left, right, innerL, innerR = row[1], row[2], row[3], row[4], row[5]

    if y <= 15 then
      for x = left, right do
        local tone
        if x == left or x == right then
          tone = "dark"
        elseif innerL > 0 and x >= innerL and x <= innerR then
          local p = pool[y]
          if y <= 11 then
            tone = "dark"
          elseif p and x >= p[1] and x <= p[2] then
            tone = "brine"
            if x == p[1] then tone = "brine_h" end
            if x == p[2] then tone = "glaze_d" end
          else
            tone = "clay_sh"
          end
        elseif innerL > 0 and (x == innerL - 1 or x == innerR + 1) then
          tone = "glaze_d"
        else
          tone = ringTone(x)
        end
        image:drawPixel(x, y, palette[tone])
      end
    elseif y <= 18 then
      -- 唇后只留暗面填充，作物图与前沿都会盖住
      span(image, y, left + 1, right, "clay_sh")
      span(image, y, left, left, "dark")
    else
      for x = left, right do
        local tone
        if x == left or x == right then
          tone = "dark"
        elseif y >= 28 then
          tone = "clay_sh"
        else
          tone = bodyTone(x, left, right)
        end
        image:drawPixel(x, y, palette[tone])
      end
    end
  end
  -- 左上肩的釉痕：从唇口滴下来的一小段
  span(image, 19, 5, 7, "glaze")
  span(image, 19, 5, 5, "glaze_h")
  span(image, 20, 5, 7, "glaze")
  span(image, 20, 5, 6, "glaze_h")
  span(image, 21, 6, 7, "glaze")
  span(image, 21, 7, 7, "glaze_d")
  span(image, 22, 6, 6, "glaze_d")
end)

-- ---------- 前沿层 ----------
local rim = Sprite(32, 32, ColorMode.RGB)

layer(rim, "Front rim", function(image)
  for _, row in ipairs(rows) do
    local y, left, right = row[1], row[2], row[3]
    if y >= 16 and y <= 18 then
      for x = left, right do
        local tone = ringTone(x)
        if x == left or x == right then
          tone = "dark"
        elseif y == 16 and x >= 7 then
          -- 作物压在唇口上，这一线是它投下的接触阴影
          tone = "glaze_d"
        elseif y == 18 then
          tone = "glaze_d"
        end
        image:drawPixel(x, y, palette[tone])
      end
    end
  end

end)

-- 去掉新建精灵时自带的那层空图层
local function trim(sprite)
  while #sprite.layers > 1 and sprite.layers[1].name == "Layer 1" do
    sprite:deleteLayer(sprite.layers[1])
  end
end

local function save(sprite, name)
  trim(sprite)
  assert(sprite:saveAs(app.fs.joinPath(output, name .. ".aseprite")))
  assert(sprite:saveCopyAs(app.fs.joinPath(output, name .. ".png")))
  sprite:close()
  print("Exported " .. name .. " (.aseprite and .png)")
end

local crop = base:newSlice(Rectangle(7, 1, 18, 18))
crop.name = "CropArea"
crop.pivot = Point(16, 10)

save(base, "base-32x32")
save(rim, "rim-32x32")
