-- 通用牛皮纸种子袋 32×32，Aseprite 批处理：
--   "D:\Aseprite\aseprite.exe" --batch --script draw-seed-bag.lua
-- 形态（2026-11-26 用户选定）：24×25 的近正面纸袋，浅暖牛皮纸面。
-- 顶端一道折过来的封口：窄顶棱压在宽折面上，折面左端有一小段受光；
-- 折面下压一道折痕，袋底同样一道折面收在接地暗边上。
-- 正面 18×18 平整区 (7,9)-(24,26)，中心 (16,18)，留给游戏叠作物收获图。
local output = app.fs.filePath(debug.getinfo(1, "S").source:sub(2))
local palette = {
  edge   = 0x4A3421, -- 本色深边，不用纯黑
  crease = 0x8A6540, -- 封口折面下的折痕
  shade  = 0xA87E4F, -- 右侧背光面与袋底暗面
  fold   = 0xC39C6B, -- 封口折面与袋底折面
  face   = 0xE1C593, -- 袋身主色，也是正面平整区
  lit    = 0xEBD3A4, -- 左缘受光的一列
  rim    = 0xF4E5C4, -- 折面左端的一小段亮棱
}

for name, rgb in pairs(palette) do
  palette[name] = app.pixelColor.rgba((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, 255)
end

local function span(image, y, left, right, tone)
  for x = left, right do
    image:drawPixel(x, y, palette[tone])
  end
end

local function layer(sprite, name, draw, target)
  target = target or sprite:newLayer()
  target.name = name
  local pixels = Image(sprite.width, sprite.height, ColorMode.RGB)
  draw(pixels)
  sprite:newCel(target, 1, pixels, Point(0, 0))
end

local bag = Sprite(32, 32, ColorMode.RGB)

-- 袋身：左缘受光、右缘背光；正面与平整区同色，不另做边框
layer(bag, "Bag body", function(image)
  for y = 8, 27 do
    span(image, y, 4, 4, "edge")
    span(image, y, 5, 5, "lit")
    span(image, y, 6, 25, "face")
    span(image, y, 26, 26, "shade")
    span(image, y, 27, 27, "edge")
  end
  -- 袋底折面：左上略亮，向右压到暗，末行是接地暗边
  span(image, 28, 5, 5, "lit")
  span(image, 28, 6, 16, "fold")
  span(image, 28, 17, 26, "shade")
  span(image, 28, 4, 4, "edge")
  span(image, 28, 27, 27, "edge")
  span(image, 29, 6, 25, "edge")
end)

-- 正面平整区：18×18 单色，中心 (16,18)，作物图叠在这里
layer(bag, "Front panel", function(image)
  for y = 9, 26 do span(image, y, 7, 24, "face") end
end)

-- 横向封口：窄顶棱 + 折面（左端受光）+ 折痕
layer(bag, "Seal fold", function(image)
  span(image, 5, 9, 22, "edge")
  span(image, 6, 6, 25, "fold")
  span(image, 6, 8, 12, "lit")
  span(image, 6, 9, 11, "rim")
  span(image, 7, 5, 26, "crease")
  span(image, 7, 5, 5, "edge")
  span(image, 7, 26, 26, "edge")
end)

-- 去掉新建精灵时自带的那层空图层
while #bag.layers > 3 and bag.layers[1].name == "Layer 1" do
  bag:deleteLayer(bag.layers[1])
end

-- 把叠图区域写进源文件，后来的人不用数像素
local crop = bag:newSlice(Rectangle(7, 9, 18, 18))
crop.name = "CropArea"
crop.pivot = Point(16, 18)

local function save(sprite, name)
  assert(sprite:saveAs(app.fs.joinPath(output, name .. ".aseprite")))
  assert(sprite:saveCopyAs(app.fs.joinPath(output, name .. ".png")))
  sprite:close()
  print("Exported " .. name .. " (.aseprite and .png)")
end

save(bag, "base-32x32")
