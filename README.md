# WhatsApp API con whatsapp-web.js

API básica de WhatsApp usando Express.js y whatsapp-web.js que permite enviar mensajes y gestionar chats de forma programática.

## 🚀 Instalación

### 1. Clonar o crear el proyecto
```bash
mkdir whatsapp-api
cd whatsapp-api
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Instalar PM2 globalmente (para producción)
```bash
npm install -g pm2
```

## 📱 Configuración inicial

### 1. Ejecutar en desarrollo
```bash
npm run dev
```

### 2. Obtener código QR
Visita `http://localhost:3000/api/qr` o revisa la consola para ver el código QR.

### 3. Escanear con WhatsApp
Abre WhatsApp en tu teléfono → Configuración → Dispositivos vinculados → Vincular dispositivo → Escanea el QR.

## 🌐 Endpoints disponibles

### Estado del servicio
```
GET /api/status
```
Devuelve el estado actual del servicio y código QR si está disponible.

### Obtener código QR
```
GET /api/qr
```
Obtiene el código QR para autenticación.

### Enviar mensaje
```
POST /api/send-message
Content-Type: application/json

{
  "number": "5491234567890",
  "message": "Hola, este es un mensaje de prueba"
}
```

### Información de número
```
GET /api/number-info/5491234567890
```
Verifica si un número existe en WhatsApp.

### Obtener chats
```
GET /api/chats
```
Lista todos los chats disponibles.

### Reiniciar cliente
```
POST /api/restart
```
Reinicia el cliente WhatsApp.

## 🚀 Despliegue en producción

### Opción 1: Con PM2 (Recomendado)
```bash
# Crear directorio de logs
mkdir logs

# Iniciar con PM2
npm run pm2:start

# Ver logs
npm run pm2:logs

# Reiniciar
npm run pm2:restart

# Detener
npm run pm2:stop
```

### Opción 2: Con Docker
Crea un `Dockerfile`:

```dockerfile
FROM node:18-alpine

# Instalar dependencias del sistema para Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Configurar Puppeteer para usar Chromium instalado
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

Construir y ejecutar:
```bash
docker build -t whatsapp-api .
docker run -d -p 3000:3000 --name whatsapp-api whatsapp-api
```

### Opción 3: En VPS/Servidor
```bash
# En tu servidor
git clone tu-repositorio
cd whatsapp-api
npm install
npm install -g pm2

# Crear servicio systemd (opcional)
sudo nano /etc/systemd/system/whatsapp-api.service
```

## 🔧 Configuración avanzada

### Variables de entorno
Crea un archivo `.env`:
```
PORT=3000
NODE_ENV=production
```

### Proxy reverso con Nginx
```nginx
server {
    listen 80;
    server_name tu-dominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 📝 Ejemplos de uso

### Enviar mensaje con curl
```bash
curl -X POST http://localhost:3000/api/send-message \
  -H "Content-Type: application/json" \
  -d '{
    "number": "5491234567890",
    "message": "Hola desde la API!"
  }'
```

### Verificar estado
```bash
curl http://localhost:3000/api/status
```

## 🛠️ Próximas mejoras sugeridas

- [ ] Webhook para mensajes entrantes
- [ ] Autenticación con API keys
- [ ] Rate limiting
- [ ] Base de datos para historial
- [ ] Envío de archivos multimedia
- [ ] Grupos y difusión
- [ ] Programación de mensajes
- [ ] Dashboard web

## ⚠️ Consideraciones importantes

1. **Términos de servicio**: Asegúrate de cumplir con los términos de WhatsApp
2. **Rate limiting**: WhatsApp tiene límites en el envío de mensajes
3. **Sesión**: La sesión se guarda en `./whatsapp-session/`
4. **Recursos**: El cliente puede consumir memoria, monitorea el uso
5. **Reinicio**: Si el QR expira, reinicia el servicio

## 🐛 Solución de problemas

### El cliente no se conecta
- Verifica que el código QR no haya expirado
- Reinicia el servicio: `npm run pm2:restart`
- Elimina la carpeta `whatsapp-session` y vuelve a autenticar

### Error de memoria
- Aumenta el límite en `ecosystem.config.js`
- Reinicia periódicamente con cron job

### Problemas con Docker
- Asegúrate de que Chrome/Chromium esté correctamente instalado
- Verifica los argumentos de Puppeteer para headless

## 📞 Soporte

Para problemas específicos con whatsapp-web.js, consulta su [documentación oficial](https://wwebjs.dev/).

---

¡Tu API básica de WhatsApp está lista! 🎉