#!/bin/bash
API_USER="hydna"
API_KEY="9804ed36bbfb01c226ad200a95e90dff"

FILE="dist/hydna.js"

AUTH_SERVER="https://lon.auth.api.rackspacecloud.com/v1.0"

DATA=`curl -s -f -D - \
           -H "X-Auth-Key: $API_KEY" \
           -H "X-Auth-User: $API_USER" \
           $AUTH_SERVER`
TOKEN=`echo "$DATA" | grep "X-Auth-Token:" | awk '{print $2}'`
STORAGE=`echo "$DATA" | grep "X-Storage-Url:" | awk '{print $2}' | tr -d '\r'`

# echo $TOKEN
# echo $STORAGE

MD5=`md5sum $FILE | awk '{print $1}'`
CTYPE="application/javascript"
FILENAME=`basename $FILE`

curl -X PUT -T $FILE -H "ETag: $MD5" -H "Content-type: $CTYPE" -H "X-Auth-Token: $TOKEN" "$STORAGE/cdn/$FILENAME"
 
# curl -X PUT -T dist/hydna.js -H "Content-Type: application/javascript" -H "X-Auth-Token: $TOKEN" "https://storage.clouddrive.com/hydna.js"
