DIST=`pwd`/dist
CONFIG=`pwd`/build/config.json


all: lib

dist:
	mkdir -p $(DIST)

lib: dist
	tools/build $(CONFIG) $(DIST)/lib.js
	
	
.PHONY: lib