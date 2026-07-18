export FLASK_ENV=development
#export http_proxy=http://proxy.tcs.com:8080
#export https_proxy=http://proxy.tcs.com:8080
#export no_proxy=localhost,127.0.0.1,10.170.21.213,10.169.51.2
#export HTTP_PROXY=http://proxy.tcs.com:8080
#export HTTPS_PROXY=http://proxy.tcs.com:8080
#export NO_PROXY=localhost,127.0.0.1,10.170.21.213,10.169.51.2
flask run -h 0.0.0.0 -p 8004 --cert="/opt/ismartams.crt" --key="/opt/ismartams.key"
