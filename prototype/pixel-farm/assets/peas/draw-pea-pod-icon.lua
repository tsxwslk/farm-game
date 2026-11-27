-- 柳湾 · 鲜豌豆荚（背包图 32×32，缩到 18×18 叠种子袋）
-- aseprite --batch --script draw-pea-pod-icon.lua
-- 斜放：左下短蒂，右上尖梢；上缘平滑、下缘三四处豆粒鼓包。
-- 左上是浅黄绿受光面，主体豆绿，下缘橄榄绿，整圈本色深边。
-- 只落整像素，不做抗锯齿。

local out = app.fs.filePath(debug.getinfo(1, "S").source:sub(2))
local IC = 32

local function rgba(hex)
  return app.pixelColor.rgba((hex >> 16) & 255, (hex >> 8) & 255, hex & 255, 255)
end

local C = {
  rim     = rgba(0x2F3D1D),
  oliveD  = rgba(0x4A5A2A),
  olive   = rgba(0x63743A),
  pea     = rgba(0x86A84C),
  peaLit  = rgba(0xA5C466),
  pale    = rgba(0xC8DE8C),
  hi      = rgba(0xDCEAA8),
  stem    = rgba(0x7A6B3C),
  stemLit = rgba(0x95844C),
  stemD   = rgba(0x5A4E2A),
  cut     = rgba(0xE0D6A6),
}

local LX, LY = -0.70710678, -0.70710678

-- 豆荚轴线：从左下到右上，微微向下鼓
local A = { x = 6.8, y = 23.4 }
local B = { x = 26.6, y = 6.2 }

local function put(img, x, y, tone, solid)
  if x >= 0 and x < IC and y >= 0 and y < IC then
    img:drawPixel(x, y, tone)
    solid[y * IC + x] = true
  end
end

local function drawPod(img, solid)
  local ax, ay = A.x, A.y
  local bx, by = B.x, B.y
  local vx, vy = bx - ax, by - ay
  local len = math.sqrt(vx * vx + vy * vy)
  local dx, dy = vx / len, vy / len
  local px, py = -dy, dx

  -- 四个豆粒中心（沿轴比例）、半径；豆粒之间留浅谷
  local peaAt = { 0.22, 0.50, 0.78 }
  local peaR = 3.4
  local curve = 1.6
  local lu = LX * dx + LY * dy
  local lv = LX * px + LY * py

  for yy = 0, IC - 1 do
    for xx = 0, IC - 1 do
      local rx, ry = xx - ax, yy - ay
      local u = rx * dx + ry * dy
      local v = rx * px + ry * py
      if u >= 0 and u <= len then
        local s = u / len
        local taper = math.sin(math.pi * (0.05 + 0.90 * s)) ^ 0.42
        if s > 0.86 then taper = taper * (1 - ((s - 0.86) / 0.14) ^ 1.4) end
        if s > 0.94 then taper = taper * 0.35 end
        local ht = 3.0 * taper
        local lo = 1.4 * taper
        for _, s0 in ipairs(peaAt) do
          local du = u - s0 * len
          local rr = peaR * (0.80 + 0.20 * math.sin(math.pi * s0))
          if math.abs(du) < rr then
            lo = math.max(lo, 0.55 + math.sqrt(rr * rr - du * du) * taper)
          end
        end
        local vv = v - curve * s * s
        if vv >= -ht and vv <= lo then
          local t = (vv + ht) / (ht + lo)
          local tone = C.pea
          -- 每颗豆的左上受光：按豆心方向提亮
          local best2, bdu, bdv, brr = 1e9, 0, 0, 1
          for _, s0 in ipairs(peaAt) do
            local du = u - s0 * len
            local dv = vv - (0.9 + curve * s0 * s0)
            local rr = peaR * (0.80 + 0.20 * math.sin(math.pi * s0))
            local d2 = du * du + dv * dv
            if d2 < best2 then
              best2 = d2
              brr = rr
              bdu, bdv = du, dv
            end
          end
          if math.sqrt(best2) < brr then
            local shade = (lu * bdu + lv * bdv) / brr
            if shade > 0.34 then tone = C.peaLit end
            if shade > 0.72 then tone = C.pale end
          end
          -- 下缘橄榄绿只占最后两像素
          if t > 0.78 then tone = C.olive end
          if t > 0.92 then tone = C.oliveD end
          -- 豆粒之间的缝：只压在下半
          for _, s0 in ipairs({ 0.36, 0.64 }) do
            if math.abs(u - s0 * len) < 1.2 and t > 0.12 then tone = C.oliveD end
          end
          -- 上缘最亮的一条
          if vv < -ht + 0.55 then tone = C.hi end
          put(img, xx, yy, tone, solid)
        end
      end
    end
  end
end

local icon = Sprite(IC, IC, ColorMode.RGB)
local solid = {}

local function layer(sprite, name, draw)
  local target = sprite:newLayer()
  target.name = name
  local pixels = Image(sprite.width, sprite.height, ColorMode.RGB)
  draw(pixels)
  sprite:newCel(target, 1, pixels, Point(0, 0))
end

layer(icon, "Pod", function(img) drawPod(img, solid) end)

-- 整圈本色深边：只描贴着空处的一圈
layer(icon, "Outline", function(img)
  for key in pairs(solid) do
    local x, y = key % IC, math.floor(key / IC)
    for _, n in ipairs({ { x - 1, y }, { x + 1, y }, { x, y - 1 }, { x, y + 1 } }) do
      if n[1] >= 0 and n[1] < IC and n[2] >= 0 and n[2] < IC and not solid[n[2] * IC + n[1]] then
        img:drawPixel(n[1], n[2], C.rim)
      end
    end
  end
end)

assert(icon:saveAs(app.fs.joinPath(out, "05-inventory.aseprite")))
assert(icon:saveCopyAs(app.fs.joinPath(out, "05-inventory.png")))
icon:close()
print("Exported 05-inventory")
