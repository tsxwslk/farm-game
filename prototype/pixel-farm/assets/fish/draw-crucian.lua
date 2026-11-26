-- 柳湾河鲫鱼 32×32，Aseprite 批处理：
--   "D:\Aseprite\aseprite.exe" --batch --script draw-crucian.lua
-- 头朝左，扁而高的体型，短钝吻，短叉尾。离水后的背包物品，无底板、无钩线。
-- 背灰橄榄、腹银灰偏暖；左上受光，鳍根压在体侧之上，不留深色接缝。
local output = app.fs.filePath(debug.getinfo(1, "S").source:sub(2))
local palette = {
  edge     = 0x2C2B1C, -- 本色深边（橄榄最暗）
  back_sh  = 0x4A4C33, -- 背部暗面
  back     = 0x6A6A46, -- 背部灰橄榄
  back_hi  = 0x8B8A5F, -- 背脊受光
  flank    = 0xC0B78F, -- 体侧银灰
  flank_hi = 0xD8CFA9, -- 体侧反光
  belly    = 0xECE2C4, -- 下腹暖银
  belly_hi = 0xF7F0DA, -- 腹部高光
  fin      = 0x9C9670, -- 鳍的灰橄榄
  fin_sh   = 0x6E6B4C, -- 鳍的暗面
}

for name, rgb in pairs(palette) do
  palette[name] = app.pixelColor.rgba((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, 255)
end

local function span(image, y, left, right, tone)
  for x = left, right do
    image:drawPixel(x, y, palette[tone])
  end
end

local function vspan(image, x, top, bottom, tone)
  for y = top, bottom do
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

-- 体侧逐列的上下缘：头在左，尾柄在右，背腹各走一道弧
local body = {
  [1]  = {16, 16}, [2]  = {15, 17}, [3]  = {14, 18}, [4]  = {13, 18},
  [5]  = {13, 19}, [6]  = {12, 19}, [7]  = {12, 20}, [8]  = {11, 20},
  [9]  = {11, 21}, [10] = {11, 21}, [11] = {11, 21}, [12] = {11, 21},
  [13] = {11, 20}, [14] = {12, 20}, [15] = {12, 19}, [16] = {12, 19},
  [17] = {13, 19}, [18] = {13, 18}, [19] = {14, 18}, [20] = {14, 17},
  [21] = {15, 17},
}

-- 尾鳍逐列：尾柄张开成短扇，后缘一个开口的叉
local tail = {
  [22] = {{14, 18}},
  [23] = {{12, 20}},
  [24] = {{11, 21}},
  [25] = {{11, 15}, {17, 21}},
  [26] = {{11, 14}, {18, 21}},
  [27] = {{11, 13}, {19, 20}},
}

local fish = Sprite(32, 32, ColorMode.RGB)

-- 身体：按列铺四段色带，上下缘各压一像素深边
layer(fish, "Body", function(image)
  for x = 1, 21 do
    local top, bottom = body[x][1], body[x][2]
    local height = bottom - top
    for y = top, bottom do
      local t = (y - top) / math.max(1, height)
      local tone = "flank"
      if x == 1 or y == top or y == bottom then
        tone = "edge"
      elseif t < 0.24 then
        tone = "back_sh"
      elseif t < 0.44 then
        tone = "back"
      elseif t < 0.74 then
        tone = "flank"
      else
        tone = "belly"
      end
      image:drawPixel(x, y, palette[tone])
    end
  end
  -- 头部上缘的一小片受光
  for x = 3, 7 do
    image:drawPixel(x, body[x][1] + 1, palette.back_hi)
  end
  -- 体侧反光：靠前的一小片
  for x = 5, 9 do
    local y = body[x][1] + math.floor((body[x][2] - body[x][1]) * 0.52)
    image:drawPixel(x, y, palette.flank_hi)
    if x <= 7 then image:drawPixel(x, y + 1, palette.flank_hi) end
  end
  -- 腹部高光：贴前腹
  for x = 6, 12 do
    image:drawPixel(x, body[x][2] - 1, palette.belly_hi)
  end
  -- 鳃盖：头后一道浅弧
  for y = 13, 18 do
    local x = 6
    if y >= 15 and y <= 16 then x = 7 end
    image:drawPixel(x, y, palette.fin_sh)
  end
  -- 眼睛：一只小深色眼
  for y = 14, 15 do
    for x = 4, 5 do
      image:drawPixel(x, y, palette.edge)
    end
  end
  image:drawPixel(4, 14, palette.belly_hi)
end)

-- 鳍压在体侧之上：背鳍贴着背脊，尾鳍张开，胸鳍和臀鳍各一小片
layer(fish, "Fins", function(image)
  -- 背鳍：贴着背脊的两行矮脊，顶边压暗
  for x = 7, 14 do
    local t = body[x][1]
    image:drawPixel(x, t, palette.fin)
    image:drawPixel(x, t - 1, palette.fin)
    image:drawPixel(x, t - 2, palette.fin_sh)
  end

  -- 尾鳍
  for x, list in pairs(tail) do
    for _, s in ipairs(list) do
      vspan(image, x, s[1], s[2], "fin")
    end
  end
  for y = 14, 18 do
    image:drawPixel(21, y, palette.fin)
  end
  for y = 15, 17 do
    image:drawPixel(22, y, palette.fin)
  end
  for _, p in ipairs({{25, 11}, {26, 11}, {27, 11}, {26, 14}, {27, 13},
                      {25, 21}, {26, 21}, {27, 20}, {26, 18}, {27, 19}}) do
    image:drawPixel(p[1], p[2], palette.fin_sh)
  end
  -- 鳍条：从尾柄散出去的三条暗线
  for _, p in ipairs({{23, 13}, {24, 12}, {25, 12}, {24, 20}, {25, 20}, {23, 19}}) do
    image:drawPixel(p[1], p[2], palette.fin_sh)
  end

  -- 臀鳍
  span(image, 19, 16, 17, "fin")
  span(image, 20, 15, 18, "fin")
  span(image, 21, 16, 17, "fin_sh")

  -- 胸鳍
  span(image, 16, 8, 9, "fin")
  span(image, 17, 8, 10, "fin")
  span(image, 18, 9, 10, "fin_sh")
  image:drawPixel(8, 15, palette.fin_sh)
end)

assert(fish:saveAs(app.fs.joinPath(output, "crucian-32x32.aseprite")))
assert(fish:saveCopyAs(app.fs.joinPath(output, "crucian-32x32.png")))
fish:close()
print("Exported crucian-32x32 (.aseprite and .png)")
