CURRENTDIR=$(PWD)
DIST=$(PWD)/dist
BUILD=$(PWD)/tools/build
JS_TARGET=$(DIST)/lib.js
JSMIN_TARGET=$(DIST)/lib.min.js
JSSM_TARGET=$(DIST)/lib.map
CONFIG=$(PWD)/build/config.json
ASBRIDGE=$(PWD)/asbridge
ASBRIDGE_DIST=$(ASBRIDGE)/dist

all: flash-bridge lib

dist:
	mkdir -p $(DIST)

lib: dist
	$(BUILD) $(CONFIG) $(JS_TARGET) $(JSMIN_TARGET) $(JSSM_TARGET)

flash-bridge: dist
	make -C $(ASBRIDGE) -f Makefile
	cp $(ASBRIDGE_DIST)/* $(DIST)
	
.PHONY: lib flash-bridge