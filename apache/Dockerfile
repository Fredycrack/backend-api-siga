# Servidor web Apache para el proyecto SIGA
FROM httpd:2.4

# Habilitar los modulos de proxy necesarios para redirigir hacia la API
RUN sed -i \
    -e 's/^#LoadModule proxy_module/LoadModule proxy_module/' \
    -e 's/^#LoadModule proxy_http_module/LoadModule proxy_http_module/' \
    /usr/local/apache2/conf/httpd.conf

# Incluir la configuracion propia del proyecto
COPY siga.conf /usr/local/apache2/conf/extra/siga.conf
RUN echo "Include conf/extra/siga.conf" >> /usr/local/apache2/conf/httpd.conf

# Pagina de presentacion servida por Apache
COPY index.html /usr/local/apache2/htdocs/index.html

EXPOSE 80
