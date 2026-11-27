-- 紫苏鲫鱼汤 32×32，Aseprite 批处理：
--   /Applications/Aseprite.app/Contents/MacOS/aseprite --batch --script draw-perilla-soup.lua
-- 沿用家常鲫鱼汤的同一只矮陶碗、同一 32×32 画布与俯视角度：
-- 碗形、灰褐陶色、乳白汤面、一小块银灰鱼肉、两笔蒸汽都照旧；
-- 汤面上点一片深紫、尖卵形、带明显缺口的紫苏叶，旁边露一小截紫褐叶柄。
-- 图层：Bowl / Soup / Perilla / Steam —— 原汤与紫苏层各自独立，可分别编辑。
-- 另导出紫苏层单图 perilla-leaf-layer-32x32.png，便于复用。
local output = app.fs.filePath(debug.getinfo(1, "S").source:sub(2))
local palette = {
  edge    = 0x332B25, -- 本色深边
  clay_d  = 0x443A32, -- 碗身暗面、口内阴影
  clay    = 0x5E5045, -- 碗身主色
  clay_hi = 0x7A6A5C, -- 碗身受光
  rim_hi  = 0xAE9B84, -- 碗口顶面受光
  rim     = 0x947F69, -- 碗口顶面
  rim_sh  = 0x6F5E4F, -- 碗口顶面背光
  soup_d  = 0xD9CBB2, -- 汤面靠碗壁的一圈
  soup    = 0xF2E8D3, -- 汤面乳白
  soup_hi = 0xFBF4E2, -- 汤面反光
  fish    = 0xB7B4A4, -- 银灰鱼肉
  fish_d  = 0x8E8B7A, -- 鱼肉暗面
  onion   = 0x7FA05B, -- 青葱
  steam   = 0xF6EDDC, -- 蒸汽
  leaf_edge = 0x34182A, -- 紫苏叶深紫褐描边
  leaf_d    = 0x4E2138, -- 叶暗面
  leaf      = 0x6B3252, -- 叶主色（深紫）
  leaf_hi   = 0x9A5A78, -- 叶受光边
  stem      = 0x64404A, -- 叶柄
  stem_d    = 0x4E3038, -- 叶柄暗侧
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

-- y, 外沿左, 外沿右, 汤面左, 汤面右（汤面为 0 表示该行没有开口）
local rows = {
  {11, 12, 19,  0,  0},
  {12,  8, 23, 13, 18},
  {13,  5, 26, 10, 21},
  {14,  3, 28,  8, 23},
  {15,  3, 28,  7, 24},
  {16,  4, 27,  7, 24},
  {17,  5, 26,  8, 23},
  {18,  6, 25, 10, 21},
  {19,  7, 24, 13, 18},
  {20,  8, 23,  0,  0},
  {21,  9, 22,  0,  0},
  {22, 10, 21,  0,  0},
  {23, 11, 20,  0,  0},
  {24, 11, 20,  0,  0},
}

local bowl = Sprite(32, 32, ColorMode.RGB)

-- 碗：外沿之内、汤面之外是碗口环面；汤面以下整段是碗身（与原版逐行一致）
layer(bowl, "Bowl", function(image)
  for _, row in ipairs(rows) do
    local y, left, right, innerL, innerR = row[1], row[2], row[3], row[4], row[5]
    for x = left, right do
      local tone
      if x == left or x == right then
        tone = "edge"
      elseif innerL > 0 and x >= innerL and x <= innerR then
        tone = nil -- 汤面，交给下一层
      elseif innerL > 0 and (x == innerL - 1 or x == innerR + 1) then
        tone = "clay_d"
      elseif y >= 20 then
        local t = (x - left) / math.max(1, right - left)
        if y == 20 then
          tone = "clay_d"
        elseif t < 0.28 then
          tone = "clay_hi"
        elseif t < 0.72 then
          tone = "clay"
        else
          tone = "clay_d"
        end
      else
        local t = (x - 3) / 25
        if t < 0.34 then
          tone = "rim_hi"
        elseif t < 0.74 then
          tone = "rim"
        else
          tone = "rim_sh"
        end
      end
      if tone then image:drawPixel(x, y, palette[tone]) end
    end
  end
  span(image, 24, 12, 19, "clay_d")
  image:drawPixel(11, 24, palette.edge)
  image:drawPixel(20, 24, palette.edge)
end)

-- 汤面：乳白，靠壁一圈压暗，左上反光；鱼肉挪到左前，给右上的紫苏叶让位
layer(bowl, "Soup", function(image)
  for _, row in ipairs(rows) do
    local y, innerL, innerR = row[1], row[4], row[5]
    if innerL > 0 then
      span(image, y, innerL, innerR, "soup")
    end
  end
  for _, row in ipairs(rows) do
    local y, innerL, innerR = row[1], row[4], row[5]
    if innerL > 0 then
      image:drawPixel(innerL, y, palette.soup_d)
      image:drawPixel(innerR, y, palette.soup_d)
    end
  end
  span(image, 14, 10, 12, "soup_hi")
  span(image, 15, 9, 10, "soup_hi")

  -- 一小块鱼肉
  span(image, 16, 9, 12, "fish")
  span(image, 17, 10, 12, "fish")
  image:drawPixel(9, 17, palette.fish_d)
  image:drawPixel(13, 16, palette.fish_d)
  image:drawPixel(13, 17, palette.fish_d)

  -- 青葱两三点，留在右前，避开紫苏叶
  image:drawPixel(20, 17, palette.onion)
  image:drawPixel(19, 18, palette.onion)
end)

-- 紫苏叶：深紫、尖卵形，右下一处明显缺口，柄在左前
local leafRows = {
  {12, 17, 18}, -- 尖
  {13, 15, 19},
  {14, 14, 18}, -- 齿：右沿收一像素
  {15, 13, 19}, -- 齿尖
  {16, 13, 18}, -- 齿
  {17, 13, 16},
  {18, 13, 14}, -- 基部
}

local function drawLeaf(image)
  local leafPixels = {}
  for i, row in ipairs(leafRows) do
    local y, left, right = row[1], row[2], row[3]
    for x = left, right do
      local tone = "leaf"
      if x == left or x == right then
        tone = "leaf_edge"
      elseif i <= 4 and x == left + 1 then
        tone = "leaf_hi" -- 受光边只在上半段的左上内侧
      elseif i >= 5 and x == right - 1 then
        tone = "leaf_d"
      end
      image:drawPixel(x, y, palette[tone])
      leafPixels[y * 32 + x] = true
    end
  end
  -- 齿口内角压一像素暗面，让缺口更明显
  image:drawPixel(18, 15, palette.leaf_d)
  image:drawPixel(17, 16, palette.leaf_d)
  -- 叶柄：一小截紫褐，从叶基右下伸出
  image:drawPixel(14, 18, palette.stem)
  image:drawPixel(15, 18, palette.stem_d)
  image:drawPixel(15, 19, palette.stem_d)
end

layer(bowl, "Perilla", function(image) drawLeaf(image) end)

-- 蒸汽：与原版一样两笔
layer(bowl, "Steam", function(image)
  image:drawPixel(11, 10, palette.steam)
  image:drawPixel(10, 9, palette.steam)
  image:drawPixel(11, 8, palette.steam)
  image:drawPixel(12, 7, palette.steam)

  image:drawPixel(18, 10, palette.steam)
  image:drawPixel(18, 9, palette.steam)
  image:drawPixel(19, 8, palette.steam)
end)

assert(bowl:saveAs(app.fs.joinPath(output, "perilla-crucian-soup-32x32.aseprite")))
assert(bowl:saveCopyAs(app.fs.joinPath(output, "perilla-crucian-soup-32x32.png")))
bowl:close()

-- 紫苏层单图：只留叶与柄，透明底，供复用或单独调色
local leafOnly = Image(32, 32, ColorMode.RGB)
drawLeaf(leafOnly)
assert(leafOnly:saveAs(app.fs.joinPath(output, "perilla-leaf-layer-32x32.png")))
print("Exported perilla-crucian-soup-32x32 (.aseprite and .png) + perilla-leaf-layer-32x32.png")
