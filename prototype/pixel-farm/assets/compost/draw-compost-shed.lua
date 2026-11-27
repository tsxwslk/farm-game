-- 柳湾 · 院子里的堆肥棚（48×48 场景）
-- aseprite --batch --script draw-compost-shed.lua
-- 两根矮木柱撑一片向后倾斜的旧木雨盖；下面是三面围住、正面敞开的矮木槽。
-- 前沿压低，露出深褐碎料与几段短草梗；左上受光，整体比角色矮。
-- 接地点：最下方木框中央 (24,44)，画面不越过该行。

local out = app.fs.filePath(debug.getinfo(1, "S").source:sub(2))
local IC = 48
local OX, OY = 24, 44

local function rgba(hex)
  return app.pixelColor.rgba((hex >> 16) & 255, (hex >> 8) & 255, hex & 255, 255)
end

local C = {
  -- 旧暖木：箱身与木柱
  woodEdge = rgba(0x3A2A1B),
  woodDark = rgba(0x60442A),
  woodSh   = rgba(0x7A5A37),
  wood     = rgba(0x987046),
  woodLit  = rgba(0xAE8458),
  woodTop  = rgba(0xC2996A),
  nail     = rgba(0x4A3A28),

  -- 略灰的旧屋盖
  roofEdge = rgba(0x37342D),
  roofDark = rgba(0x605C53),
  roofSh   = rgba(0x746F64),
  roof     = rgba(0x898377),
  roofLit  = rgba(0x9E9789),
  roofTop  = rgba(0xB3AB9B),

  -- 堆肥
  soilEdge = rgba(0x2B2117),
  soilDk   = rgba(0x3A2B1D),
  soil     = rgba(0x4B3826),
  soilLit  = rgba(0x5D4831),
  straw    = rgba(0xB7A268),
  strawLit = rgba(0xCBB77C),
  shade    = rgba(0x2E2319),
}

local function dot(img, x, y, tone)
  if x >= 0 and x < IC and y >= 0 and y < IC then
    img:drawPixel(x, y, C[tone])
  end
end

local function span(img, y, l, r, tone)
  for x = l, r do dot(img, x, y, tone) end
end

local function layer(sprite, name, draw)
  local target = sprite:newLayer()
  target.name = name
  local pixels = Image(sprite.width, sprite.height, ColorMode.RGB)
  draw(pixels)
  sprite:newCel(target, 1, pixels, Point(0, 0))
end

local function save(sprite, name)
  while #sprite.layers > 1 and sprite.layers[1].name == "Layer 1" do
    sprite:deleteLayer(sprite.layers[1])
  end
  local slice = sprite:newSlice(Rectangle(0, 0, IC, IC))
  slice.name = "Placement"
  slice.pivot = Point(OX, OY)
  assert(sprite:saveAs(app.fs.joinPath(out, name .. ".aseprite")))
  assert(sprite:saveCopyAs(app.fs.joinPath(out, name .. ".png")))
  sprite:close(); print("Exported " .. name)
end

local shed = Sprite(IC, IC, ColorMode.RGB)

--[[ 1. 两根矮木柱：先画，柱脚随后被箱体压住 --]]
layer(shed, "Posts", function(img)
  for _, x0 in ipairs({ 13, 32 }) do
    for y = 15, 28 do
      dot(img, x0, y, "woodEdge")
      dot(img, x0 + 1, y, "woodLit")
      dot(img, x0 + 2, y, "wood")
      dot(img, x0 + 3, y, "woodEdge")
    end
    span(img, 25, x0, x0 + 3, "woodDark")
    dot(img, x0 + 1, 25, "woodSh")
    span(img, 15, x0 + 1, x0 + 2, "woodDark")
  end
end)

--[[ 2. 箱体后壁 + 内部堆肥 + 草梗 --]]
layer(shed, "Back and compost", function(img)
  -- 后壁：顶面 + 正面
  span(img, 26, 11, 37, "woodEdge")
  span(img, 27, 12, 36, "woodTop")
  span(img, 28, 12, 36, "woodLit")
  span(img, 29, 12, 36, "wood")

  -- 堆肥：远侧压暗，近侧略亮
  for y = 30, 37 do
    span(img, y, 14, 34, "soil")
  end
  for y = 27, 29 do span(img, y, 14, 34, "soilDk") end
  -- 翻堆的团块
  span(img, 31, 16, 19, "soilLit")
  span(img, 32, 16, 18, "soilDk")
  span(img, 34, 28, 31, "soilLit")
  span(img, 35, 28, 30, "soilDk")
  span(img, 30, 23, 25, "soilLit")
  span(img, 36, 20, 22, "soilDk")

  -- 短草梗：几段 1–2 像素的浅黄
  for _, s in ipairs({ { 17, 30 }, { 22, 29 }, { 30, 30 }, { 26, 33 }, { 20, 35 } }) do
    dot(img, s[1], s[2], "straw")
    dot(img, s[1] + 1, s[2], "strawLit")
  end
  dot(img, 32, 33, "straw")
  dot(img, 24, 36, "strawLit")

  -- 前沿投在堆肥上的一道暗影
  span(img, 37, 14, 34, "shade")
end)

--[[ 3. 三面围住的箱体：侧板 + 压低的前沿 + 底框 --]]
layer(shed, "Bin", function(img)
  -- 左侧板
  span(img, 27, 9, 14, "woodEdge")
  span(img, 28, 10, 13, "woodTop")
  span(img, 29, 10, 13, "woodLit")
  for y = 30, 43 do
    dot(img, 9, y, "woodEdge")
    dot(img, 10, y, "woodLit")
    dot(img, 11, y, "wood")
    dot(img, 12, y, "woodSh")
    dot(img, 13, y, "woodDark")
    dot(img, 14, y, "woodEdge")
  end
  -- 右侧板：背光压深
  span(img, 27, 34, 39, "woodEdge")
  span(img, 28, 35, 38, "woodSh")
  span(img, 29, 35, 38, "wood")
  for y = 30, 43 do
    dot(img, 34, y, "woodEdge")
    dot(img, 35, y, "woodSh")
    dot(img, 36, y, "wood")
    dot(img, 37, y, "woodDark")
    dot(img, 38, y, "woodDark")
    dot(img, 39, y, "woodEdge")
  end

  -- 前沿：压低的一块横板，顶面受光
  span(img, 38, 10, 38, "woodEdge")
  span(img, 39, 11, 37, "woodTop")
  span(img, 40, 11, 37, "woodLit")
  for y = 41, 43 do
    dot(img, 10, y, "woodEdge")
    for x = 11, 37 do
      local tone = "wood"
      if x < 16 then tone = "woodLit" elseif x > 32 then tone = "woodSh" end
      dot(img, x, y, tone)
    end
    dot(img, 38, y, "woodEdge")
  end
  -- 前板的竖缝
  span(img, 41, 17, 17, "woodDark")
  span(img, 42, 17, 17, "woodDark")
  span(img, 41, 31, 31, "woodDark")
  span(img, 42, 31, 31, "woodDark")

  -- 底框：接地的一行压到最深
  span(img, 43, 10, 38, "woodEdge")
  span(img, 44, 10, 38, "woodDark")
  span(img, 44, 15, 33, "woodEdge")
end)

--[[ 4. 旧木雨盖：向后倾斜，前缘厚、后缘薄 --]]
layer(shed, "Roof", function(img)
  local rows = {
    { 9, 13, 35 },
    { 10, 12, 36 },
    { 11, 12, 36 },
    { 12, 11, 37 },
    { 13, 10, 38 },
    { 14, 10, 38 },
    { 15, 8, 40 },
    { 16, 8, 40 },
    { 17, 7, 41 },
    { 18, 7, 41 },
    { 19, 7, 41 },
  }
  for _, r in ipairs(rows) do
    local y, l, rr = r[1], r[2], r[3]
    span(img, y, l, rr, "roofEdge")
    span(img, y, l + 1, rr - 1, "roof")
  end

  -- 从后往前由暗到亮：后坡背光，前缘受光
  span(img, 10, 13, 35, "roofSh")
  span(img, 11, 13, 35, "roofSh")
  span(img, 12, 12, 36, "roofDark")
  span(img, 13, 11, 37, "roof")
  span(img, 14, 11, 37, "roof")
  span(img, 15, 10, 38, "roofDark")
  span(img, 16, 10, 38, "roofLit")
  span(img, 17, 8, 40, "roofLit")
  span(img, 18, 8, 40, "roofTop")
  span(img, 19, 8, 40, "roofSh")

  -- 左缘受光
  for y = 9, 17 do
    local l = rows[y - 8][2]
    dot(img, l + 1, y, "roofLit")
  end
  -- 两颗钉
  dot(img, 14, 10, "nail")
  dot(img, 33, 10, "nail")
  -- 前沿中央的磕碰缺口
  dot(img, 24, 19, "roofDark")
  dot(img, 25, 19, "roofDark")
end)

save(shed, "compost-shed-48x48")
