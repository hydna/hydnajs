CURRENTDIR=$(PWD)
DIST=$(PWD)/dist
BUILD=$(PWD)/tools/build
JS_TARGET=$(DIST)/hydna.js
JSMIN_TARGET=$(DIST)/hydna.min.js
JSSM_TARGET=$(DIST)/hydna.map
CONFIG=$(PWD)/build/config.json
ASBRIDGE=$(PWD)/asbridge
ASBRIDGE_DIST=$(ASBRIDGE)/dist

CDNJS_DIST=$(PWD)/cdnjsdist
CDNJS_JS_TARGET=$(CDNJS_DIST)/hydna.js
CDNJS_JSMIN_TARGET=$(CDNJS_DIST)/hydna.min.js
CDNJS_JSSM_TARGET=$(CDNJS_DIST)/hydna.map

all: flash-bridge lib
cdnjs: flash-bridge lib-cdnjs

dist:
	mkdir -p $(DIST)

lib: dist
	$(BUILD) $(CONFIG) $(JS_TARGET) $(JSMIN_TARGET) $(JSSM_TARGET)

flash-bridge: dist
	make -C $(ASBRIDGE) -f Makefile
	cp $(ASBRIDGE_DIST)/* $(DIST)

dist-cdnjs:
	mkdir -p $(CDNJS_DIST)

lib-cdnjs: dist-cdnjs
	$(BUILD) $(CONFIG) $(CDNJS_JS_TARGET) $(CDNJS_JSMIN_TARGET) $(CDNJS_JSSM_TARGET)
	cp $(ASBRIDGE_DIST)/* $(CDNJS_DIST)

.PHONY: lib flash-bridge
