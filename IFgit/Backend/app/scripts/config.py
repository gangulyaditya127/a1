import os
from dotenv import load_dotenv

load_dotenv()

Config_DB={
    "ENV": "DEV",
    "DB_Server": 'oraasswd04-scan.nam.nsroot.net',
    "Port": '8889',   
    "SID": 'ISMRT1D',
    "SERVICE_NAME" : '',
    "User_Login_ID":os.getenv("USER_LOGIN_ID"),
    "User_pwd": os.getenv("USER_PWD")
}
                       
Send_Mail_From={ "Mail_From": 'dl.gcg.in.ismart.admin@imcnam.ssmb.com' }
Send_Mail_CC={ "Mail_CC": 'ld86944@citi.com,kd15604@citi.com,kb54667@citi.com,im73903@citi.com,hg13300@citi.com'}
Smtp_detail={ "host": 'imbapprelay-restricted.wlb2.nam.nsroot.net', "port": 25, "password": os.getenv("SMTP_PASSWORD")}