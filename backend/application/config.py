from datetime import timedelta


class config:
    DEBUG = False
    SQLALCHEMY_TRACK_MODIFICATIONS = True


class local_development_config(config):
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///local.db"
    SECRET_KEY = "cvdkshvkhdsbc.ksjbc.kjsdbc.khjdB.KCJDBKJCBDKBC.KAbck.jadBC.KJDbc.kjB.KJbs.cbsd.vb.ksvbjk.sdb"
    SECURITY_PASSWORD_HASH = "argon2"
    SECURITY_PASSWORD_SALT = "jh,qdv,kdb.kadbc.jabc.jbhjadjdhdb.akjsbc.kjabxa.jbc.ajkcgb.akjbc.ajkhc.wuegc.jdabc.kajgc.akcbakdhb.kjbc.kjbc.kjbc.kjbc"
    WTF_CSRF_ENABLED = False
    SECURITY_TOKEN_AUTHENTICATION_HEADER = "Authentication-token"
    CACHE_TYPE = "RedisCache"
    CACHE_REDIS_HOST = "localhost"
    CACHE_REDIS_PORT = 6379
    CACHE_REDIS_DB = 3
    JWT_SECRET_KEY = "jwt-campus-cred-dev-key-change-in-production"
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=12)
    JWT_TOKEN_LOCATION = ["headers"]
    JWT_HEADER_NAME = "Authorization"
    JWT_HEADER_TYPE = "Bearer"