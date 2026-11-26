-- Run with aseprite.exe --batch --script draw-tool-icons.lua.
-- 《物志》柳湾绘制提示：透明 16×16 原生像素，左上受光，低饱和木、石、铁。
-- 给轮廓留一圈透明像素，明暗用硬边色块，成品没有投影或抗锯齿。
-- 水壶：横宽矮壶身，左侧空心环柄，右侧长斜嘴抬高，洒水头外翻。
-- 石镐：横跨画面的下弯双尖，石灰高光和粗麻扎口，短斜柄接在弧中。
-- 锄头：斜放长柄，右端是细颈和横宽平刃，刃口下沿留直线。
-- 斧子：近竖直的木柄，左上伸出宽厚扇刃，斧头和斧柄呈明显的倒 L 形。
-- 钓竿：细竹竿向右上弯，竿下留白，右侧浅色垂线末端挂朱红浮漂。

local output = app.fs.filePath(debug.getinfo(1, "S").source:sub(2))
local tones = {
  x = 0x332F28, w = 0x725030, b = 0xA57444, m = 0xCD9C60, h = 0xEDC788,
  s = 0x565E57, g = 0x79867E, c = 0x9AADA1, p = 0xC4D0BB, j = 0xECEBCD,
  k = 0x605748, r = 0x867B67, t = 0xAFA28C, f = 0xD5C7AA,
  d = 0x3C5B55, e = 0x547A6F, a = 0x6A9A8C, u = 0x98BEA9, n = 0xC8D9BB,
  l = 0xC1BAA2, v = 0x9E4534, z = 0xDE7250,
}
local pixels = {}
for key, rgb in pairs(tones) do
  pixels[key] = app.pixelColor.rgba((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, 255)
end

-- Coordinates are relative to the 16×16 canvas. Dots leave transparent pixels.
local function draw(image, rows)
  for _, row in ipairs(rows) do
    local y, left, colors = table.unpack(row)
    assert(y > 0 and y < 15 and left > 0 and left + #colors <= 15)
    for index = 1, #colors do
      local key = colors:sub(index, index)
      if key ~= "." then
        image:drawPixel(left + index - 1, y, assert(pixels[key], "Unknown palette key: " .. key))
      end
    end
  end
end

local function save(name, layers)
  local sprite = Sprite(16, 16, ColorMode.RGB)
  for index, spec in ipairs(layers) do
    local layer = index == 1 and sprite.layers[1] or sprite:newLayer()
    layer.name = spec[1]
    local image = Image(16, 16, ColorMode.RGB)
    draw(image, spec[2])
    sprite:newCel(layer, 1, image, Point(0, 0))
  end
  assert(sprite:saveAs(app.fs.joinPath(output, name .. "-16x16.aseprite")))
  assert(sprite:saveCopyAs(app.fs.joinPath(output, name .. "-16x16.png")))
  sprite:close()
  print("Exported " .. name)
end

save("can", {
  {"Loop and spout", {
    {3,12,"xxx"}, {4,12,"xnx"}, {5,11,"xuxx"}, {6,11,"xadx"},
    {7,10,"xuax"}, {8,10,"xaex"}, {9,9,"xuex"}, {10,9,"xadx"}, {11,9,"xxx"},
    {6,2,"xxxx"}, {7,1,"xuaxd"}, {8,1,"xa..e"}, {9,1,"xa..e"},
    {10,1,"xe..d"}, {11,2,"xeex"}, {12,3,"xxx"},
  }},
  {"Tin body", {
    {5,6,"xxxx"}, {6,5,"xnudex"}, {7,4,"xnunuadx"}, {8,4,"xuunuaadx"},
    {9,4,"xuuuaaedx"}, {10,4,"xuaauaedx"}, {11,4,"xuaaeeedx"},
    {12,4,"xueaaeddx"}, {13,4,"xnuuaaedx"}, {14,5,"xxxxxxx"},
  }},
  {"Fill opening", {
    {6,7,"dx"}, {7,6,"uje"},
  }},
})

save("pick", {
  {"Wooden shaft", {
    {4,7,"xxx"}, {5,7,"xmbx"}, {6,6,"xhmwx"}, {7,6,"xhmwx"},
    {8,5,"xhmwx"}, {9,5,"xhmwx"}, {10,4,"xhmwx"}, {11,4,"xhmwx"},
    {12,3,"xhmwx"}, {13,3,"xmbx"}, {14,3,"xxx"},
  }},
  {"Chipped stone head", {
    {2,5,"xxxxxxx"}, {3,3,"xxftftttrxx"}, {4,2,"xftttftrrttrx"},
    {5,2,"xtrkxrtrkxrtr"}, {6,1,"xtrxx....xxtrx"},
    {7,1,"xrx........xrx"}, {8,1,"xx..........xx"},
  }},
  {"Flax lashings", {
    {3,8,"f"}, {4,7,"fhr"}, {5,7,"bfx"}, {6,7,"hw"},
  }},
})

save("hoe", {
  {"Wooden shaft", {
    {3,11,"xx"}, {4,9,"xxhxx"}, {5,7,"xxhhmbx"}, {6,5,"xxhhmbxx"},
    {7,3,"xxhhmbxx"}, {8,1,"xxhhmbxx"}, {9,1,"xhhmbxx"}, {10,1,"xmbxx"},
    {11,1,"xxx"},
  }},
  {"Socket and iron blade", {
    {3,11,"xxx"}, {4,11,"xpgx"}, {5,12,"xcx"}, {6,12,"xcx"},
    {7,11,"xpgx"}, {8,10,"xcpgg"}, {9,9,"xcppgs"}, {10,8,"xcppcgs"},
    {11,8,"xjppccs"}, {12,8,"xjjppcx"}, {13,9,"xxxxxx"},
  }},
})

save("axe", {
  {"Wooden shaft", {
    {2,9,"xxx"}, {3,9,"xhbx"}, {4,9,"xhbx"}, {5,9,"xhbx"}, {6,9,"xhbx"},
    {7,9,"xhbx"}, {8,9,"xhbx"}, {9,8,"xhmwx"}, {10,8,"xhmwx"},
    {11,8,"xhbx"}, {12,7,"xhmwx"}, {13,7,"xmbx"}, {14,7,"xxx"},
  }},
  {"Forged axe head", {
    {2,3,"xx"}, {3,2,"xjpxxxx"}, {4,2,"xjppccggsx"},
    {5,2,"xjppcggggsx"}, {6,2,"xjpcgggsgsx"}, {7,2,"xjpccgsxsx"},
    {8,2,"xjpcgsxxx"}, {9,3,"xjgsx"}, {10,4,"xxx"},
  }},
  {"Eye and wedge", {{4,9,"cp"}, {5,9,"ch"}, {6,10,"m"}}},
})

save("rod", {
  {"Bamboo and grip", {
    {2,11,"xhx"}, {3,8,"xxhmmx"}, {4,7,"xhhmx"}, {5,6,"xhmbx"},
    {6,5,"xhmbx"}, {7,4,"xhmbx"}, {8,4,"xhmx"}, {9,3,"xhmx"},
    {10,3,"xmbx"}, {11,2,"xhmwx"}, {12,2,"xbmwx"},
    {13,1,"xhmwx"}, {14,1,"xxxx"},
  }},
  {"Line and float", {
    {3,13,"l"}, {4,13,"l"}, {5,13,"l"}, {6,13,"l"}, {7,13,"l"}, {8,13,"l"},
    {9,13,"j"}, {10,12,"xjx"}, {11,12,"jzv"}, {12,12,"xzv"}, {13,13,"x"},
  }},
})
