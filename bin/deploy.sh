#!/bin/bash
lib_path="dist/lib.js"
bridge_path="dist/bridge.swf"
version="1"

# don't edit below this line

if [ -z "$CDN_API_USER" ]; then
    echo "You must set \$CDN_API_USER";
    exit 1;
fi

if [ -z "$CDN_API_KEY" ]; then
    echo "You must set \$CDN_API_KEY";
    exit 1;
fi

function putfile() {
    local path=$1
    local filename=$2
    local ctype=$3

    local md5=`md5sum $path | awk '{print $1}'`

    curl -s -X PUT -T $path -H "ETag: $md5" -H "Content-type: $ctype" -H "X-Auth-Token: $token" "$storage/cdn/$version/$filename" > /dev/null
}

auth_server="https://lon.auth.api.rackspacecloud.com/v1.0"

data=`curl -s -f -D - \
           -H "X-Auth-Key: $CDN_API_KEY" \
           -H "X-Auth-User: $CDN_API_USER" \
           $auth_server`
token=`echo "$data" | grep "X-Auth-Token:" | awk '{print $2}'`
storage=`echo "$data" | grep "X-Storage-Url:" | awk '{print $2}' | tr -d '\r'`

putfile $lib_path "hydna.js" "application/javascript"
putfile $bridge_path "bridge.swf" "application/x-shockwave-flash"
