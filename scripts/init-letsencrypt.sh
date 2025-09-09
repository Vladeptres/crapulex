#!/bin/bash

# Initialize Let's Encrypt SSL certificates for bourracho
# Usage: ./init-letsencrypt.sh your-domain.com your-email@example.com

if [ $# -ne 2 ]; then
    echo "Usage: $0 <domain> <email>"
    echo "Example: $0 bourracho.example.com admin@example.com"
    exit 1
fi

DOMAIN=$1
EMAIL=$2

# Check if domain is accessible
echo "Checking if domain $DOMAIN is accessible..."
if ! ping -c 1 $DOMAIN > /dev/null 2>&1; then
    echo "Warning: Domain $DOMAIN is not accessible. Make sure:"
    echo "1. DNS is pointing to this server"
    echo "2. Ports 80 and 443 are open"
    echo "3. Domain is correctly configured"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Create directory structure
mkdir -p nginx/conf.d
mkdir -p certbot/conf
mkdir -p certbot/www

# Update nginx configuration with actual domain
sed -i "s/your-domain.com/$DOMAIN/g" nginx/conf.d/bourracho.conf

echo "Starting nginx for initial certificate request..."

# Start nginx temporarily for certificate generation
docker-compose -f docker-compose.prod.yml up -d nginx

echo "Waiting for nginx to start..."
sleep 10

# Request certificate
echo "Requesting SSL certificate for $DOMAIN..."
docker-compose -f docker-compose.prod.yml run --rm certbot \
    certonly --webroot --webroot-path=/var/www/certbot \
    --email $EMAIL --agree-tos --no-eff-email \
    -d $DOMAIN

if [ $? -eq 0 ]; then
    echo "Certificate obtained successfully!"
    
    # Restart nginx with SSL configuration
    echo "Restarting nginx with SSL configuration..."
    docker-compose -f docker-compose.prod.yml restart nginx
    
    echo "SSL certificate setup complete!"
    echo "Your site should now be accessible at https://$DOMAIN"
else
    echo "Certificate request failed. Please check:"
    echo "1. Domain DNS is pointing to this server"
    echo "2. Ports 80 and 443 are accessible"
    echo "3. No other services are using these ports"
    exit 1
fi
