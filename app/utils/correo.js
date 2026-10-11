import nodemailer from 'nodemailer';
import { config } from '../config/env.js';

/**
 * Envio de correo por SMTP (RF34). Si las variables SMTP no estan definidas,
 * el envio no esta disponible y el sistema lo informa sin interrumpir la operacion.
 */
export const correoConfigurado = () => Boolean(config.smtp.host && config.smtp.usuario && config.smtp.clave);

export const enviarCorreo = async ({ para, asunto, texto, adjuntos = [] }) => {
  if (!correoConfigurado()) {
    const e = new Error('El envio de correo no esta configurado en el servidor (variables SMTP_HOST, SMTP_USER y SMTP_PASS)');
    e.estado = 503;
    throw e;
  }
  const transporte = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.puerto,
    secure: config.smtp.puerto === 465,
    auth: { user: config.smtp.usuario, pass: config.smtp.clave }
  });
  return transporte.sendMail({ from: config.smtp.remitente, to: para, subject: asunto, text: texto, attachments: adjuntos });
};
