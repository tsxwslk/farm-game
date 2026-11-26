-- 家常鲫鱼汤 32×32，Aseprite 批处理：
--   "D:\Aseprite\aseprite.exe" --batch --script draw-crucian-soup.lua
-- 俯视微倾的矮陶碗：椭圆碗口、灰褐陶质、暖乳白汤面，露少量银灰鱼肉与青葱，
-- 碗口上方两簇浅暖蒸汽。透明底，无碗垫、无文字。
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

-- 碗：外沿之内、汤面之外是碗口环面；汤面以下整段是碗身
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
        -- 碗身：左受光、右背光；首行压暗，和碗口顶面分开
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
        -- 碗口顶面：左上受光、右下压暗
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
  -- 碗足：底部一道压暗的收边
  span(image, 24, 12, 19, "clay_d")
  image:drawPixel(11, 24, palette.edge)
  image:drawPixel(20, 24, palette.edge)
end)

-- 汤面：乳白，靠壁一圈压暗，左上一点反光，落少量鱼肉和青葱
layer(bowl, "Soup", function(image)
  for _, row in ipairs(rows) do
    local y, innerL, innerR = row[1], row[4], row[5]
    if innerL > 0 then
      span(image, y, innerL, innerR, "soup")
    end
  end
  -- 靠碗壁的一圈阴影
  for _, row in ipairs(rows) do
    local y, innerL, innerR = row[1], row[4], row[5]
    if innerL > 0 then
      image:drawPixel(innerL, y, palette.soup_d)
      image:drawPixel(innerR, y, palette.soup_d)
    end
  end
  -- 左上反光
  span(image, 14, 10, 12, "soup_hi")
  span(image, 15, 9, 10, "soup_hi")
  -- 鱼肉：两小块银灰
  span(image, 15, 11, 14, "fish")
  span(image, 16, 12, 15, "fish")
  image:drawPixel(14, 16, palette.fish_d)
  image:drawPixel(15, 16, palette.fish_d)
  image:drawPixel(11, 17, palette.fish_d)
  -- 青葱：两三点
  image:drawPixel(18, 14, palette.onion)
  image:drawPixel(19, 15, palette.onion)
  image:drawPixel(17, 16, palette.onion)
end)

-- 蒸汽：碗口上方两簇浅暖细线
layer(bowl, "Steam", function(image)
  image:drawPixel(11, 10, palette.steam)
  image:drawPixel(10, 9, palette.steam)
  image:drawPixel(11, 8, palette.steam)
  image:drawPixel(12, 7, palette.steam)

  image:drawPixel(18, 10, palette.steam)
  image:drawPixel(18, 9, palette.steam)
  image:drawPixel(19, 8, palette.steam)
end)

assert(bowl:saveAs(app.fs.joinPath(output, "crucian-soup-32x32.aseprite")))
assert(bowl:saveCopyAs(app.fs.joinPath(output, "crucian-soup-32x32.png")))
bowl:close()
print("Exported crucian-soup-32x32 (.aseprite and .png)")
