-- Run with aseprite.exe --batch --script draw-mud-tiles.lua.
-- 32×32 柳湾河岸淤泥，透明边缘贴住原地表。湿泥用深灰褐和断续的灰青反光，
-- 横向水痕沿岸摊开。挖完后留哑光浅坑、土沿与两道铲痕。
local output = app.fs.filePath(debug.getinfo(1, "S").source:sub(2))
local colors = {
  bank = 0xA47B51, bankLight = 0xB98F5E, dampBank = 0x795A46,
  clay = 0x645049, clayLight = 0x826754, clayDark = 0x4F3E37,
  wet = 0x433530, basin = 0x352C29, ripple = 0x615950,
  shallow = 0x7D7A69, glint = 0xA09E85,
}
for name, rgb in pairs(colors) do
  colors[name] = app.pixelColor.rgba((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, 255)
end

local function strokes(image, tone, rows)
  for _, row in ipairs(rows) do
    local y, left, right = table.unpack(row)
    for x = left, right do image:drawPixel(x, y, colors[tone]) end
  end
end

local function profile(image, tone, top, rows)
  for offset, row in ipairs(rows) do
    for x = row[1], row[2] do image:drawPixel(x, top + offset - 1, colors[tone]) end
  end
end

local function edge(image)
  profile(image, "bank", 4, {
    {12,18}, {8,21}, {6,24}, {5,26}, {4,27}, {4,28},
    {3,28}, {3,29}, {2,29}, {2,30}, {1,30}, {1,30}, {1,30},
    {2,30}, {2,30}, {2,29}, {3,29}, {3,28}, {4,27}, {5,27},
    {6,26}, {6,25}, {8,24}, {10,22}, {13,19},
  })
  strokes(image, "bankLight", {
    {4,12,15}, {5,8,11}, {6,6,8}, {8,4,6}, {11,3,4}, {14,1,3},
    {7,24,26}, {9,26,28}, {23,5,7}, {25,6,8}, {27,10,13},
    {6,3,4}, {9,2,2}, {26,26,27}, {24,28,29}, {29,19,20},
  })
  profile(image, "dampBank", 6, {
    {13,19}, {9,22}, {7,24}, {6,25}, {5,27}, {4,27},
    {4,28}, {3,28}, {3,29}, {3,29}, {3,29}, {3,29},
    {4,29}, {4,28}, {5,27}, {5,26}, {6,26}, {6,25},
    {8,24}, {9,22}, {12,20},
  })
  strokes(image, "dampBank", {{13,1,2}, {17,2,3}, {23,4,5}, {25,6,7}, {12,29,30}, {20,28,29}, {27,18,21}})
end

local function wetSilt(image)
  profile(image, "clay", 7, {
    {14,18}, {11,21}, {8,23}, {7,24}, {6,25}, {5,26},
    {5,27}, {4,27}, {4,28}, {4,28}, {4,28}, {4,28},
    {5,28}, {5,27}, {6,26}, {6,25}, {7,24}, {9,23}, {11,21},
  })
  profile(image, "clayDark", 9, {
    {16,20}, {12,22}, {10,24}, {8,24}, {7,26}, {6,26}, {6,27},
    {6,27}, {5,27}, {5,27}, {6,27}, {6,26}, {7,25}, {8,23}, {11,22},
  })
  profile(image, "wet", 11, {
    {14,21}, {11,23}, {9,24}, {8,25}, {8,26}, {7,26},
    {7,27}, {8,26}, {9,25}, {9,24}, {11,23}, {13,20},
  })
  profile(image, "basin", 14, {
    {15,22}, {13,24}, {11,25}, {10,25}, {11,25}, {13,24}, {16,22},
  })
  strokes(image, "clayLight", {
    {8,11,14}, {9,8,11}, {10,7,9}, {12,5,7}, {14,4,6},
    {18,4,6}, {20,6,9}, {22,7,10}, {24,10,14},
    {9,22,23}, {12,25,26}, {22,24,25},
  })
end

local function reflections(image)
  strokes(image, "ripple", {
    {12,12,17}, {13,10,15}, {13,18,21}, {14,19,23},
    {15,8,13}, {16,7,15}, {16,21,26}, {17,16,23},
    {18,8,12}, {18,14,21}, {19,10,17}, {20,20,24},
    {21,12,21}, {22,15,18},
  })
  strokes(image, "shallow", {
    {13,11,14}, {16,9,14}, {17,16,20}, {17,24,25},
    {19,11,15}, {21,14,19},
  })
  strokes(image, "glint", {{16,10,12}, {17,17,19}, {21,15,17}})
end

local function dugSilt(image)
  profile(image, "clay", 8, {
    {11,20}, {8,23}, {7,24}, {6,25}, {5,26}, {5,27},
    {4,27}, {4,28}, {4,28}, {4,28}, {5,28}, {5,27},
    {6,27}, {6,26}, {7,25}, {8,24}, {10,22}, {13,19},
  })
  profile(image, "clayLight", 10, {
    {10,19}, {8,22}, {7,23}, {6,24}, {6,25}, {5,26},
    {5,26}, {6,26}, {6,26}, {7,25}, {7,24}, {9,22}, {11,20},
  })
  profile(image, "clayDark", 11, {
    {12,19}, {10,22}, {9,23}, {8,24}, {8,25}, {7,26},
    {7,25}, {8,25}, {8,24}, {10,23}, {12,21},
  })
  profile(image, "wet", 12, {
    {12,18}, {10,21}, {9,22}, {9,23}, {9,23}, {10,23},
    {10,22}, {11,21}, {13,20},
  })
  strokes(image, "basin", {{12,13,17}, {13,11,19}, {14,10,16}, {15,9,13}, {16,9,11}})
  strokes(image, "clay", {{16,17,22}, {17,15,21}, {18,13,19}, {19,12,15}, {19,18,22}, {20,15,20}})
  strokes(image, "clayLight", {{17,17,21}, {18,14,17}, {20,16,19}, {21,12,14}, {23,9,10}, {24,15,20}})
  strokes(image, "bankLight", {{9,8,10}, {10,7,9}, {19,6,8}, {23,9,13}, {22,21,24}})
end

local function save(name, layers)
  local sprite = Sprite(32, 32, ColorMode.RGB)
  for index, spec in ipairs(layers) do
    local layer = index == 1 and sprite.layers[1] or sprite:newLayer()
    layer.name = spec[1]
    local pixels = Image(32, 32, ColorMode.RGB)
    spec[2](pixels)
    sprite:newCel(layer, 1, pixels, Point(0, 0))
  end
  assert(sprite:saveAs(app.fs.joinPath(output, name .. ".aseprite")))
  assert(sprite:saveCopyAs(app.fs.joinPath(output, name .. ".png")))
  sprite:close()
  print("Exported " .. name)
end

save("bank-mud-32x32", {{"Bank edge", edge}, {"Wet silt", wetSilt}, {"Reflections", reflections}})
save("bank-mud-dug-32x32", {{"Bank edge", edge}, {"Dig marks", dugSilt}})
