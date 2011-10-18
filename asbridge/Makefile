CC=`which mxmlc`
DEST=dist
SRC=-sp src
TARGET=$(DEST)/bridge.swf

all: bridge10

dest:
	mkdir -p $(DEST)

bridge10: dest
	$(CC) -load-config=conf/flash10.xml src/bridge.as -o $(TARGET) $(SRC)

trace-mac:
	tail -f ~/Library/Preferences/Macromedia/Flash\ Player/Logs/flashlog.txt
	
.PHONY: bridge10 trace 