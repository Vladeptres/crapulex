# 🔒 Production Security Checklist for Bourracho

## ⚠️ CRITICAL SECURITY ISSUES FOUND

Your current Docker setup has several **HIGH RISK** vulnerabilities that must be addressed before exposing to the internet:

### 🚨 Immediate Actions Required

- [ ] **STOP using the current docker-compose.yml in production** - it exposes databases directly to the internet
- [ ] **Change all default passwords** - MongoDB and Redis use weak defaults
- [ ] **Generate new Django secret key** - current key is exposed in code
- [ ] **Configure proper domain restrictions** - ALLOWED_HOSTS currently allows any domain

## 🛡️ Secure Production Deployment

### 1. Use the Secure Configuration

Replace your current setup with the secure production files:

```bash
# Use the secure production configuration
docker-compose -f docker-compose.prod.yml up -d
```

### 2. Environment Configuration

1. **Copy and configure production environment:**
   ```bash
   cp .env.production .env
   ```

2. **Update these CRITICAL values in .env:**
   ```bash
   # Generate a strong 50-character secret key
   BOURRACHO_SECRET_KEY=your-random-50-character-secret-key-here

   # Use strong passwords (min 16 chars, mixed case, numbers, symbols)
   MONGO_ROOT_PASSWORD=YourStrongMongoPassword123!@#
   REDIS_PASSWORD=YourStrongRedisPassword456!@#

   # Replace with your actual domain
   ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com
   CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
   ```

### 3. SSL Certificate Setup

1. **Make the script executable:**
   ```bash
   chmod +x scripts/init-letsencrypt.sh
   ```

2. **Run SSL setup:**
   ```bash
   ./scripts/init-letsencrypt.sh yourdomain.com admin@yourdomain.com
   ```

## 🔍 Security Improvements Implemented

### Network Security
- ✅ **Database ports removed from public exposure** (MongoDB 27017, Redis 6379)
- ✅ **Internal Docker network** - services only communicate internally
- ✅ **Nginx reverse proxy** - only ports 80/443 exposed
- ✅ **Rate limiting** - API and login endpoints protected

### Authentication & Authorization
- ✅ **MongoDB authentication** enabled with strong credentials
- ✅ **Redis password protection** implemented
- ✅ **Django secret key** from environment variables
- ✅ **ALLOWED_HOSTS** restricted to specific domains

### SSL/TLS Security
- ✅ **Let's Encrypt SSL certificates** with auto-renewal
- ✅ **TLS 1.2/1.3 only** - weak protocols disabled
- ✅ **HSTS headers** - force HTTPS connections
- ✅ **HTTP to HTTPS redirect** - no insecure connections

### Application Security
- ✅ **Security headers** - XSS, CSRF, clickjacking protection
- ✅ **File upload restrictions** - prevent malicious file execution
- ✅ **Admin interface protection** - optional IP restrictions
- ✅ **Debug mode disabled** in production

## 🚫 What NOT to Do

- ❌ **Never use docker-compose.yml in production** - it's insecure
- ❌ **Never expose database ports** (27017, 6379) to the internet
- ❌ **Never use default passwords** in production
- ❌ **Never set ALLOWED_HOSTS = ["*"]** in production
- ❌ **Never run with DEBUG = True** in production

## 🔧 Additional Security Recommendations

### Server Level
- [ ] **Configure UFW firewall:**
  ```bash
  sudo ufw default deny incoming
  sudo ufw default allow outgoing
  sudo ufw allow ssh
  sudo ufw allow 80
  sudo ufw allow 443
  sudo ufw enable
  ```

- [ ] **Keep system updated:**
  ```bash
  sudo apt update && sudo apt upgrade -y
  ```

- [ ] **Configure fail2ban** for SSH protection
- [ ] **Disable root SSH login**
- [ ] **Use SSH keys instead of passwords**

### Monitoring & Logging
- [ ] **Set up log monitoring** (ELK stack, Grafana, etc.)
- [ ] **Monitor failed login attempts**
- [ ] **Set up disk space alerts**
- [ ] **Monitor SSL certificate expiration**

### Backup Strategy
- [ ] **Automate MongoDB backups:**
  ```bash
  # Add to crontab
  0 2 * * * docker exec bourracho-mongodb mongodump --out /backup/$(date +%Y%m%d)
  ```

- [ ] **Backup media files regularly**
- [ ] **Test backup restoration process**

## 🚨 Emergency Response

If you suspect a security breach:

1. **Immediately stop all services:**
   ```bash
   docker-compose -f docker-compose.prod.yml down
   ```

2. **Check logs for suspicious activity:**
   ```bash
   docker-compose -f docker-compose.prod.yml logs nginx
   docker-compose -f docker-compose.prod.yml logs backend
   ```

3. **Change all passwords and regenerate secret keys**
4. **Review access logs and user accounts**
5. **Update all dependencies and restart with clean containers**

## ✅ Security Verification

After deployment, verify security:

- [ ] **Port scan your server** - only 22, 80, 443 should be open
- [ ] **Test SSL configuration** at [SSL Labs](https://www.ssllabs.com/ssltest/)
- [ ] **Verify database ports are not accessible** externally
- [ ] **Test rate limiting** on API endpoints
- [ ] **Check security headers** with browser dev tools

## 📞 Support

If you need help with any security configuration:
1. Check the logs: `docker-compose -f docker-compose.prod.yml logs`
2. Verify environment variables are set correctly
3. Ensure DNS is pointing to your server
4. Check firewall settings

**Remember: Security is not optional in production!**
