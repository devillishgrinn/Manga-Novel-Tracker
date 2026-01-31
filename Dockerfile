# 1️⃣ Use a lightweight Node image
FROM node:20-alpine

# 2️⃣ Set working directory
WORKDIR /app

# 3️⃣ Copy dependency files first (better caching)
COPY package.json package-lock.json* ./

# 4️⃣ Install dependencies
RUN npm install

# 5️⃣ Copy the rest of the source code
COPY . .

# 6️⃣ Build TypeScript
RUN npm run build

# 7️⃣ Default command (optional, keeps container useful)
CMD ["sh"]
