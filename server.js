const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS para permitir requests desde cualquier origen
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Estado del cliente WhatsApp
let client;
let isReady = false;
let qrCodeData = null;
let lastQrTime = null;

// Logs mejorados
function log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${type}] ${message}`);
}

// Inicializar cliente WhatsApp con configuración optimizada para Railway
function initializeWhatsApp() {
    log('Inicializando cliente WhatsApp...');
    
    client = new Client({
        authStrategy: new LocalAuth({
            dataPath: './whatsapp-session'
        }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--disable-extensions',
                '--disable-plugins',
                '--disable-images',
                '--disable-javascript',
                '--disable-default-apps',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-background-networking',
                '--memory-pressure-off',
                '--max_old_space_size=4096'
            ],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
        }
    });

    // Eventos del cliente
    client.on('loading_screen', (percent, message) => {
        log(`Cargando... ${percent}% - ${message}`);
    });

    client.on('qr', (qr) => {
        log('QR Code recibido - Escanéalo con WhatsApp');
        qrCodeData = qr;
        lastQrTime = new Date();
        qrcode.generate(qr, { small: true });
        log(`QR disponible en: ${process.env.RAILWAY_STATIC_URL || 'http://localhost:' + PORT}/api/qr`);
    });

    client.on('ready', () => {
        log('Cliente WhatsApp listo! ✅');
        isReady = true;
        qrCodeData = null;
        lastQrTime = null;
    });

    client.on('authenticated', () => {
        log('Cliente autenticado ✅');
    });

    client.on('auth_failure', (msg) => {
        log(`Error de autenticación: ${msg}`, 'ERROR');
        isReady = false;
        // Reintentar después de 30 segundos
        setTimeout(() => {
            log('Reintentando autenticación...');
            initializeWhatsApp();
        }, 30000);
    });

    client.on('disconnected', (reason) => {
        log(`Cliente desconectado: ${reason}`, 'WARNING');
        isReady = false;
        qrCodeData = null;
        // Reintentar conexión después de 10 segundos
        setTimeout(() => {
            log('Reintentando conexión...');
            initializeWhatsApp();
        }, 10000);
    });

    client.on('message', async (message) => {
        log(`Mensaje recibido de ${message.from}: ${message.body.substring(0, 100)}...`);
        
        // Respuesta automática básica (opcional)
        if (message.body.toLowerCase() === 'ping') {
            try {
                await message.reply('pong - API funcionando! 🤖');
                log('Respuesta automática enviada');
            } catch (error) {
                log(`Error enviando respuesta automática: ${error.message}`, 'ERROR');
            }
        }
    });

    // Inicializar cliente
    log('Iniciando cliente WhatsApp...');
    client.initialize().catch(err => {
        log(`Error inicializando cliente: ${err.message}`, 'ERROR');
        // Reintentar después de 15 segundos
        setTimeout(() => {
            initializeWhatsApp();
        }, 15000);
    });
}

// Rutas de la API

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// Estado del servicio
app.get('/api/status', (req, res) => {
    const qrExpired = lastQrTime && (new Date() - lastQrTime) > 120000; // 2 minutos
    
    res.json({
        status: isReady ? 'ready' : (qrCodeData && !qrExpired ? 'waiting_for_qr' : 'initializing'),
        ready: isReady,
        hasQR: !!qrCodeData && !qrExpired,
        timestamp: new Date().toISOString(),
        lastQrTime: lastQrTime,
        environment: 'railway',
        version: '1.0.0'
    });
});

// Obtener QR Code
app.get('/api/qr', (req, res) => {
    const qrExpired = lastQrTime && (new Date() - lastQrTime) > 120000;
    
    if (qrCodeData && !qrExpired) {
        res.json({
            success: true,
            qrCode: qrCodeData,
            message: 'Escanea este código QR con WhatsApp',
            expiresAt: new Date(lastQrTime.getTime() + 120000).toISOString()
        });
    } else if (isReady) {
        res.json({
            success: true,
            message: 'WhatsApp ya está conectado',
            status: 'ready'
        });
    } else {
        res.json({
            success: false,
            message: qrExpired ? 'QR Code expirado, reiniciando...' : 'QR Code no disponible aún',
            status: 'waiting'
        });
        
        // Si el QR expiró, reiniciar cliente
        if (qrExpired) {
            log('QR Code expirado, reiniciando cliente...');
            qrCodeData = null;
            lastQrTime = null;
            setTimeout(() => {
                if (client) {
                    client.destroy().then(() => {
                        initializeWhatsApp();
                    });
                } else {
                    initializeWhatsApp();
                }
            }, 2000);
        }
    }
});

// Enviar mensaje
app.post('/api/send-message', async (req, res) => {
    try {
        if (!isReady) {
            return res.status(503).json({
                success: false,
                message: 'WhatsApp no está listo',
                status: 'not_ready'
            });
        }

        const { number, message } = req.body;

        if (!number || !message) {
            return res.status(400).json({
                success: false,
                message: 'Número y mensaje son requeridos',
                example: {
                    number: "5491234567890",
                    message: "Hola desde la API!"
                }
            });
        }

        // Formatear número
        const chatId = number.includes('@c.us') ? number : `${number}@c.us`;

        log(`Enviando mensaje a ${number}: ${message.substring(0, 100)}...`);

        // Enviar mensaje
        const sentMessage = await client.sendMessage(chatId, message);

        log(`Mensaje enviado exitosamente a ${number}`);

        res.json({
            success: true,
            message: 'Mensaje enviado correctamente',
            to: number,
            messageId: sentMessage.id.id,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        log(`Error enviando mensaje: ${error.message}`, 'ERROR');
        res.status(500).json({
            success: false,
            message: 'Error enviando mensaje',
            error: error.message,
            code: error.code || 'UNKNOWN_ERROR'
        });
    }
});

// Obtener información del número
app.get('/api/number-info/:number', async (req, res) => {
    try {
        if (!isReady) {
            return res.status(503).json({
                success: false,
                message: 'WhatsApp no está listo'
            });
        }

        const { number } = req.params;
        const chatId = number.includes('@c.us') ? number : `${number}@c.us`;

        const numberDetails = await client.getNumberId(chatId);
        
        res.json({
            success: true,
            exists: !!numberDetails,
            numberInfo: numberDetails || null,
            checked: number
        });

    } catch (error) {
        log(`Error obteniendo info del número: ${error.message}`, 'ERROR');
        res.status(500).json({
            success: false,
            message: 'Error obteniendo información',
            error: error.message
        });
    }
});

// Obtener chats
app.get('/api/chats', async (req, res) => {
    try {
        if (!isReady) {
            return res.status(503).json({
                success: false,
                message: 'WhatsApp no está listo'
            });
        }

        const { limit = 50 } = req.query;
        const chats = await client.getChats();
        
        const chatList = chats.slice(0, parseInt(limit)).map(chat => ({
            id: chat.id._serialized,
            name: chat.name,
            isGroup: chat.isGroup,
            unreadCount: chat.unreadCount,
            lastMessage: chat.lastMessage ? {
                body: chat.lastMessage.body?.substring(0, 200) + (chat.lastMessage.body?.length > 200 ? '...' : ''),
                timestamp: chat.lastMessage.timestamp,
                from: chat.lastMessage.from
            } : null
        }));

        res.json({
            success: true,
            chats: chatList,
            total: chats.length,
            showing: chatList.length
        });

    } catch (error) {
        log(`Error obteniendo chats: ${error.message}`, 'ERROR');
        res.status(500).json({
            success: false,
            message: 'Error obteniendo chats',
            error: error.message
        });
    }
});

// Reiniciar cliente
app.post('/api/restart', async (req, res) => {
    try {
        log('Reiniciando cliente WhatsApp...');
        
        if (client) {
            await client.destroy();
        }
        
        isReady = false;
        qrCodeData = null;
        lastQrTime = null;
        
        setTimeout(() => {
            initializeWhatsApp();
        }, 3000);

        res.json({
            success: true,
            message: 'Cliente reiniciado',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        log(`Error reiniciando cliente: ${error.message}`, 'ERROR');
        res.status(500).json({
            success: false,
            message: 'Error reiniciando cliente',
            error: error.message
        });
    }
});

// Ruta básica con documentación
app.get('/', (req, res) => {
    res.json({
        message: 'WhatsApp API funcionando en Railway! 🚀',
        version: '1.0.0',
        status: isReady ? 'ready' : 'initializing',
        endpoints: {
            status: 'GET /api/status - Ver estado del servicio',
            qr: 'GET /api/qr - Obtener código QR para autenticación',
            sendMessage: 'POST /api/send-message - Enviar mensaje',
            numberInfo: 'GET /api/number-info/:number - Verificar número',
            chats: 'GET /api/chats - Listar chats (con limit opcional)',
            restart: 'POST /api/restart - Reiniciar cliente',
            health: 'GET /health - Health check'
        },
        documentation: 'https://github.com/tu-usuario/whatsapp-api',
        environment: process.env.NODE_ENV || 'development'
    });
});

// Manejo de errores global
app.use((err, req, res, next) => {
    log(`Error no manejado: ${err.stack}`, 'ERROR');
    res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint no encontrado',
        available_endpoints: {
            root: 'GET /',
            status: 'GET /api/status',
            qr: 'GET /api/qr',
            sendMessage: 'POST /api/send-message',
            numberInfo: 'GET /api/number-info/:number',
            chats: 'GET /api/chats',
            restart: 'POST /api/restart'
        }
    });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    log(`🚀 Servidor corriendo en puerto ${PORT}`);
    log(`📱 Inicializando WhatsApp API...`);
    log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Inicializar WhatsApp después de que el servidor esté listo
    setTimeout(() => {
        initializeWhatsApp();
    }, 2000);
});

// Manejo de cierre limpio
process.on('SIGINT', async () => {
    log('Cerrando aplicación...');
    if (client) {
        try {
            await client.destroy();
            log('Cliente WhatsApp cerrado correctamente');
        } catch (error) {
            log(`Error cerrando cliente: ${error.message}`, 'ERROR');
        }
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    log('Señal SIGTERM recibida, cerrando aplicación...');
    if (client) {
        try {
            await client.destroy();
            log('Cliente WhatsApp cerrado correctamente');
        } catch (error) {
            log(`Error cerrando cliente: ${error.message}`, 'ERROR');
        }
    }
    process.exit(0);
});

// Manejo de errores no capturados
process.on('unhandledRejection', (reason, promise) => {
    log(`Unhandled Rejection at: ${promise}, reason: ${reason}`, 'ERROR');
});

process.on('uncaughtException', (error) => {
    log(`Uncaught Exception: ${error.message}`, 'ERROR');
    log(error.stack, 'ERROR');
});