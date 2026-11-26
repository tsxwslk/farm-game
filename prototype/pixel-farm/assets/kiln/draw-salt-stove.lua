-- Run with aseprite.exe --batch --script draw-salt-stove.lua.
local output = app.fs.filePath(debug.getinfo(1, "S").source:sub(2))
local palette = {
  edge = 0x3B332E, mortar = 0x5B4D42,
  stoneDark = 0x6D5D50, stoneShade = 0x7D6D5D, stone = 0x95806A,
  stoneLit = 0xAC9479, stoneTop = 0xBDA78B,
  soot = 0x272523, chamber = 0x342D28, ash = 0x51453A,
  ironEdge = 0x373A36, ironShadow = 0x555752, ironRim = 0x70746B,
  ironMid = 0x878980, ironLight = 0xA1A397, ironGlint = 0xB6B7A6,
}

for name, rgb in pairs(palette) do
  palette[name] = app.pixelColor.rgba((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, 255)
end

local function span(image, y, left, right, tone)
  for x = left, right do
    image:drawPixel(x, y, palette[tone])
  end
end

local function spans(image, tone, segments)
  for _, segment in ipairs(segments) do
    span(image, segment[1], segment[2], segment[3], tone)
  end
end

local function profile(image, tone, y, rows)
  for index, row in ipairs(rows) do
    span(image, y + index - 1, row[1], row[2], tone)
  end
end

local function layer(sprite, name, draw, target)
  target = target or sprite:newLayer()
  target.name = name
  local pixels = Image(sprite.width, sprite.height, ColorMode.RGB)
  draw(pixels)
  sprite:newCel(target, 1, pixels, Point(0, 0))
end

local function save(sprite, name)
  assert(sprite:saveAs(app.fs.joinPath(output, name .. ".aseprite")))
  assert(sprite:saveCopyAs(app.fs.joinPath(output, name .. ".png")))
  sprite:close()
  print("Exported " .. name .. " (.aseprite and .png)")
end

local scene = Sprite(48, 48, ColorMode.RGB)
layer(scene, "Stone base", function(image)
  profile(image, "edge", 21, {
    {14,33}, {12,35}, {11,37}, {10,38}, {9,39}, {8,39},
    {8,39}, {8,39}, {8,39}, {8,39}, {8,39}, {8,39},
    {8,39}, {8,39}, {8,39}, {8,39}, {8,39}, {8,39},
    {8,39}, {8,38}, {8,37}, {9,36}, {9,35}, {10,34},
  })
  for y = 26, 42 do span(image, y, 9, 34, "mortar") end
  profile(image, "stoneShade", 25, {
    {35,38}, {34,38}, {34,38}, {34,38}, {34,38}, {34,38},
    {34,38}, {34,38}, {34,38}, {34,38}, {34,38}, {34,38},
    {34,38}, {33,38}, {33,37}, {33,36}, {33,35}, {33,34},
  })
  spans(image, "stoneDark", {
    {29,33,36}, {30,34,38}, {31,36,38}, {32,36,38}, {33,35,38},
    {35,34,37}, {36,35,38}, {37,34,37}, {39,35,38}, {40,34,37},
    {41,33,36}, {42,33,35},
  })
  spans(image, "mortar", {{31,37,38}, {32,36,37}, {36,37,38}, {37,34,36}, {38,34,35}})
  profile(image, "stoneTop", 23, {{12,35}, {11,35}, {10,35}, {9,34}, {9,33}})
  spans(image, "stoneLit", {
    {25,34,37}, {26,33,37}, {27,32,36}, {28,9,32},
    {29,10,17}, {30,9,16}, {31,9,14}, {32,10,13}, {33,10,12},
    {35,9,12}, {36,9,13}, {37,9,13}, {38,10,13},
    {40,9,13}, {41,10,16}, {42,10,15},
  })
  spans(image, "stone", {
    {28,28,35}, {29,28,33}, {30,28,33}, {31,29,32}, {32,28,33},
    {33,29,32}, {34,29,33}, {35,29,33}, {36,30,32}, {38,29,33},
    {39,29,32}, {40,28,33}, {41,18,26}, {41,28,33}, {42,17,25},
    {42,27,33}, {43,10,16}, {43,17,23}, {43,24,32},
    {32,9,9}, {33,9,9}, {33,13,15}, {34,9,15}, {37,13,15},
    {38,14,15}, {39,9,15}, {40,13,16},
  })
  spans(image, "stoneShade", {
    {31,32,33}, {33,31,33}, {35,33,35}, {36,29,33}, {39,32,34},
    {42,15,17}, {43,12,16}, {43,22,26}, {43,29,33}, {38,9,10},
  })
  spans(image, "stoneTop", {{28,9,12}, {30,10,12}, {35,9,10}, {41,10,12}})
end, scene.layers[1])

layer(scene, "Firebox", function(image)
  profile(image, "stoneDark", 29, {
    {18,24}, {16,26}, {15,27}, {14,28}, {13,28}, {13,28},
    {13,28}, {13,28}, {13,28}, {13,28}, {13,28}, {14,28}, {14,28},
  })
  spans(image, "stoneLit", {
    {30,18,23}, {31,16,20}, {32,15,17}, {33,14,16}, {34,13,15},
    {35,13,14}, {36,13,14}, {38,13,14}, {39,13,15}, {40,14,17},
  })
  spans(image, "stoneShade", {
    {31,23,25}, {32,25,26}, {33,26,27}, {34,27,28}, {35,27,27},
    {37,27,28}, {39,27,28}, {40,26,27}, {41,15,27},
  })
  profile(image, "soot", 31, {
    {20,23}, {18,25}, {17,26}, {16,26}, {16,26},
    {16,26}, {16,26}, {16,26}, {16,26}, {16,26},
  })
  spans(image, "chamber", {
    {32,23,25}, {33,25,26}, {34,25,26}, {35,25,26}, {36,25,26},
    {37,24,26}, {38,23,26}, {39,17,26}, {40,16,26},
  })
  spans(image, "ash", {{39,23,25}, {40,17,21}, {40,23,26}})
  spans(image, "stone", {{41,16,21}, {41,24,26}})
end)

layer(scene, "Iron lid", function(image)
  profile(image, "ironEdge", 18, {
    {18,29}, {15,32}, {13,34}, {11,36}, {10,37}, {10,37},
    {10,37}, {10,37}, {11,36}, {12,35}, {14,33}, {16,31}, {20,28},
  })
  profile(image, "ironShadow", 19, {
    {18,29}, {15,32}, {13,34}, {12,35}, {11,36},
    {11,36}, {11,36}, {12,35}, {14,33}, {16,31}, {20,27},
  })
  profile(image, "ironMid", 20, {
    {17,30}, {14,33}, {12,34}, {11,35}, {11,35},
    {12,34}, {14,33}, {17,29},
  })
  spans(image, "ironLight", {
    {19,19,26}, {20,16,23}, {21,14,21}, {22,12,20}, {23,11,17},
    {24,12,16}, {25,13,15}, {26,15,18}, {27,18,21},
  })
  spans(image, "ironGlint", {{20,17,20}, {21,14,17}, {22,13,15}, {23,12,13}})
  spans(image, "ironRim", {
    {20,29,31}, {21,31,33}, {22,32,35}, {23,31,36}, {24,29,36},
    {25,26,35}, {26,23,33}, {27,21,31}, {28,15,23},
  })
  spans(image, "ironShadow", {{24,35,36}, {25,33,35}, {26,31,34}, {27,29,33}, {28,25,31}})
  spans(image, "ironMid", {{28,17,22}})
end)

layer(scene, "Lid handle", function(image)
  spans(image, "ironRim", {{22,20,28}, {23,23,28}})
  spans(image, "ironEdge", {
    {14,21,26}, {15,19,28}, {16,18,21}, {16,26,29},
    {17,18,20}, {17,27,29}, {18,18,20}, {18,27,29},
    {19,18,21}, {19,26,29}, {20,18,22}, {20,26,30},
    {21,19,22}, {21,27,30},
  })
  spans(image, "ironLight", {{15,21,25}, {16,19,20}, {17,19,19}, {18,19,19}})
  spans(image, "ironRim", {{15,26,27}, {16,27,28}, {17,28,28}, {19,19,20}, {20,19,21}, {20,27,28}})
  spans(image, "ironShadow", {{17,20,20}, {18,28,28}, {19,27,28}, {20,29,29}})
end)
local placement = scene:newSlice(Rectangle(0, 0, 48, 48))
placement.name = "Placement"
placement.pivot = Point(24, 44)
save(scene, "salt-stove-scene-48x48")

local icon = Sprite(16, 16, ColorMode.RGB)
local tones = {
  e = "edge", m = "mortar", d = "stoneDark", s = "stoneShade", a = "stone",
  l = "stoneLit", t = "stoneTop", o = "soot", c = "chamber",
  r = "ironEdge", v = "ironShadow", g = "ironRim", i = "ironMid", h = "ironLight",
}
local function iconLayer(name, y, rows, target)
  layer(icon, name, function(image)
    for index, row in ipairs(rows) do
      local left, pixels = row[1], row[2]
      assert(left >= 0 and left + #pixels <= 16)
      for column = 1, #pixels do
        local code = pixels:sub(column, column)
        if code ~= "." then
          image:drawPixel(left + column - 1, y + index - 1, assert(palette[tones[code]]))
        end
      end
    end
  end, target)
end

iconLayer("Stone base", 5, {
  {3,"ettttttttte"}, {2,"ettttllllllde"}, {1,"elllllllaaaade"},
  {1,"elalslaaaasdde"}, {1,"ealasssaasdsee"}, {1,"elmaddmllasdde"},
  {1,"elsaddmaalsdde"}, {1,"eaaassmalasdee"}, {1,"elaaalaaasdse"},
  {2,"eeeeeeeeeeee"},
}, icon.layers[1])
iconLayer("Firebox", 8, {
  {5,"laas"}, {4,"laoods"}, {4,"looocd"},
  {4,"looocd"}, {4,"lccccd"}, {4,"saaasa"},
})
iconLayer("Iron lid", 3, {
  {5,"rrrrrr"}, {3,"rrhhiiigrr"}, {2,"rhhiiiigggvr"},
  {2,"rhiiiigggvvr"}, {3,"rggggvvvvrr"}, {5,"rrrrrrr"},
})
iconLayer("Lid handle", 1, {
  {6,"rrr"}, {5,"rh.rr"}, {5,"g...v"}, {5,"rr.vr"},
})
save(icon, "salt-stove-inventory-16x16")
