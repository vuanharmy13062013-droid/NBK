# Ảnh Docker cho các dịch vụ lưu trữ như Render, Railway, Fly.io
FROM node:22-alpine

WORKDIR /app
COPY . .

# Dữ liệu ghi vào /app/data — gắn ổ đĩa bền vững ở đây nếu muốn giữ dữ liệu lâu dài.
ENV PORT=3000
ENV SOS_DEMO=1
EXPOSE 3000

CMD ["node", "server/index.js"]
