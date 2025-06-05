# Usar imagen base de Node.js con Chrome preinstalado
FROM ghcr.io/puppeteer/puppeteer:latest

# Configurar directorio de trabajo
WORKDIR /app

# Configurar usuario y permisos
USER root
RUN chmod 755 /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias
RUN npm install --only=production

# Copiar código fuente
COPY . .

# Crear directorio para sesiones con permisos correctos
RUN mkdir -p /app/whatsapp-session && \
    mkdir -p /app/logs && \
    chown -R pptruser:pptruser /app

# Cambiar a usuario no root
USER pptruser

# Exponer puerto
EXPOSE 3000

# Variables de entorno para Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Comando de inicio
CMD ["npm", "start"]