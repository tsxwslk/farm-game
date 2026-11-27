-- 南山道 · 废弃石阶药圃 64×48，Aseprite 批处理：
--   /Applications/Aseprite.app/Contents/MacOS/aseprite --batch --script draw-herb-terrace.lua
-- 固定俯视微倾、左上受光。三片宽薄的灰褐石板在前排围成低矮阶沿，后排一道更薄的石沿，
-- 中间夹一条裸露的深土；石缝点少量灰绿苔，边角略有破损；前排石板之间留一道很暗的竖缝，
-- 供游戏叠加紫苏余绪。画面只有石阶、土和苔：无植株、无发光粒子、无文字、无投影底板。
-- 脚点 (32,43)。
local output = app.fs.filePath(debug.getinfo(1, "S").source:sub(2))

local C = {
  edge    = 0x2B2420, -- 石与土的深褐轮廓
  stone_h = 0xAC9479, -- 石板顶面最亮一行
  stone_l = 0x95806A, -- 顶面
  stone   = 0x7D6D5D, -- 顶面前沿 / 立面受光
  stone_f = 0x6D5D50, -- 立面
  stone_d = 0x54483C, -- 立面背光
  soil_l  = 0x74573D, -- 土面受光
  soil    = 0x5E4530, -- 土面
  soil_d  = 0x44301F, -- 土块暗面
  slot    = 0x1B1512, -- 石缝阴影（叠加余绪的地方）
  moss    = 0x6E8A56,
  moss_d  = 0x4E6B3C,
}

for name, rgb in pairs(C) do
  C[name] = app.pixelColor.rgba((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, 255)
end

local function put(img, x, y, tone)
  if x >= 0 and x < 64 and y >= 0 and y < 48 then
    img:drawPixel(x, y, C[tone])
  end
end

local function hline(img, y, x0, x1, tone)
  for x = x0, x1 do put(img, x, y, tone) end
end

local function layer(sprite, name, draw)
  local target = sprite:newLayer()
  target.name = name
  local pixels = Image(sprite.width, sprite.height, ColorMode.RGB)
  draw(pixels)
  sprite:newCel(target, 1, pixels, Point(0, 0))
end

local terrace = Sprite(64, 48, ColorMode.RGB)
local BOTTOM = 43

-- 一片薄石板：顶面 topFace 行（首行最亮），其余是立面
local function stone(img, x0, x1, topY, topFace, chipL, chipR)
  for y = topY, BOTTOM do
    local left = x0 + (y == topY and chipL or 0)
    local right = x1 - (y == topY and chipR or 0)
    for x = left, right do
      local t = (x - left) / math.max(1, right - left)
      local tone
      if x == left or x == right then
        tone = "edge"
      elseif y == BOTTOM then
        tone = "edge"
      elseif y < topY + topFace then
        tone = (y == topY) and "stone_h" or "stone_l"
      elseif y == topY + topFace then
        tone = "stone"
      else
        if t < 0.24 then
          tone = "stone"
        elseif t < 0.62 then
          tone = "stone_f"
        else
          tone = "stone_d"
        end
      end
      put(img, x, y, tone)
    end
  end
  hline(img, BOTTOM - 1, x0 + 1, x1 - 1, "stone_d")
end

-- 后排石沿：只露两行顶面，像一道薄薄的边
layer(terrace, "Back stones", function(img)
  local segs = {
    {7, 28, 27}, {30, 40, 27}, {42, 57, 28},
  }
  for _, seg in ipairs(segs) do
    local x0, x1, topY = seg[1], seg[2], seg[3]
    for x = x0, x1 do
      if x == x0 or x == x1 then
        put(img, x, topY, "edge")
        put(img, x, topY + 1, "edge")
      else
        put(img, x, topY, "stone_h")
        put(img, x, topY + 1, "stone_l")
      end
    end
    -- 顶面下沿压一像素，和后方的土分开
    hline(img, topY + 2, x0 + 1, x1 - 1, "stone_f")
  end
  -- 后沿的三道石缝
  for y = 27, 29 do
    put(img, 29, y, "slot")
    put(img, 41, y, "slot")
  end
end)

-- 中间裸露的深土：整块药圃的主体面
layer(terrace, "Soil", function(img)
  -- 土面比后沿窄一像素，左右各探出一点点，读成被石沿围住
  for y = 29, 38 do
    local left = 9 + (((y == 29) or (y == 38)) and 1 or 0)
    local right = 55 - (((y == 29) or (y == 38)) and 1 or 0)
    if y == 33 or y == 34 then left = 8 end
    if y == 35 then right = 56 end
    for x = left, right do
      local t = (x - left) / math.max(1, right - left)
      local tone = "soil"
      if t > 0.92 then tone = "soil_d" end
      put(img, x, y, tone)
    end
  end
  -- 后沿投影：土面靠石沿一行压暗
  hline(img, 29, 8, 56, "soil_d")
  -- 土面上缘受光
  hline(img, 30, 9, 55, "soil_l")
  -- 土屑与二像素土块
  for _, p in ipairs({ {12, 34}, {17, 32}, {22, 36}, {27, 33}, {32, 37}, {36, 32}, {41, 35},
                       {46, 33}, {51, 36}, {15, 37}, {44, 37} }) do
    put(img, p[1], p[2], "soil_d")
  end
  for _, p in ipairs({ {10, 33}, {20, 33}, {30, 31}, {38, 34}, {48, 32}, {54, 34} }) do
    put(img, p[1], p[2], "soil_l")
  end
  -- 靠前沿一行压暗，土面才不是一块平色
  hline(img, 37, 10, 55, "soil_d")
  -- 两道短犁沟，读成翻过的土
  hline(img, 32, 13, 19, "soil_d")
  hline(img, 35, 27, 33, "soil_d")
  -- 土里嵌的三粒小石子
  for _, p in ipairs({ {16, 34}, {35, 31}, {49, 35} }) do
    put(img, p[1], p[2], "stone_l")
    put(img, p[1] + 1, p[2], "stone_f")
    put(img, p[1], p[2] + 1, "soil_d")
  end
end)

-- 两侧短石：把土面从左右夹住，药圃才是个围合的方框
layer(terrace, "Side stones", function(img)
  for _, side in ipairs({ {8, 0}, {56, 1} }) do
    local x, mirror = side[1], side[2]
    for y = 29, 38 do
      local tone = (mirror == 0) and "stone_l" or "stone_f"
      if y == 29 then tone = "stone_h" end
      put(img, x, y, tone)
      put(img, x + mirror * 2 - 1, y, "stone_d")
    end
  end
end)

-- 前排三片石板：宽薄，顶面两行、立面三行，落到脚点行
local slabs = {
  {4,  24, 39, 2, 2, 0}, -- 左片：左角崩两像素
  {27, 39, 38, 2, 0, 1}, -- 中片：略高，右角缺一像素
  {42, 59, 39, 2, 0, 2}, -- 右片：右角崩两像素
}

layer(terrace, "Front stones", function(img)
  for _, s in ipairs(slabs) do
    stone(img, s[1], s[2], s[3], s[4], s[5], s[6])
  end
  put(img, 13, 41, "stone_d"); put(img, 13, 42, "stone_d")
  put(img, 34, 40, "stone_d"); put(img, 34, 41, "stone_d")
  put(img, 51, 41, "stone_d")
end)

-- 石缝：左边一道细缝，右边一道宽缝（留给紫苏余绪）
layer(terrace, "Gaps", function(img)
  for y = 39, BOTTOM do put(img, 25, y, "slot") end
  for y = 38, BOTTOM do
    put(img, 40, y, "slot")
    put(img, 41, y, "slot")
  end
  for y = 40, BOTTOM do
    put(img, 24, y, "stone_d")
    put(img, 26, y, "stone_d")
    put(img, 39, y, "stone_d")
    put(img, 42, y, "stone_d")
  end
end)

-- 灰绿苔：只点在缝底、后沿与两端
layer(terrace, "Moss", function(img)
  local spots = {
    {24, 42, "moss"}, {25, 42, "moss_d"}, {25, 41, "moss"},
    {39, 41, "moss"}, {43, 41, "moss_d"}, {39, 42, "moss_d"},
    {5, 42, "moss"}, {6, 43, "moss_d"}, {7, 42, "moss"},
    {57, 42, "moss"}, {58, 41, "moss_d"},
    {9, 30, "moss"}, {10, 30, "moss_d"}, {55, 30, "moss_d"},
    {30, 43, "moss_d"}, {36, 42, "moss"},
  }
  for _, s in ipairs(spots) do put(img, s[1], s[2], s[3]) end
end)

local pivot = terrace:newSlice(Rectangle(0, 0, 64, 48))
pivot.name = "Placement"
pivot.pivot = Point(32, 43)

assert(terrace:saveAs(app.fs.joinPath(output, "herb-terrace-64x48.aseprite")))
assert(terrace:saveCopyAs(app.fs.joinPath(output, "herb-terrace-64x48.png")))
terrace:close()
print("Exported herb-terrace-64x48 (.aseprite and .png)")
