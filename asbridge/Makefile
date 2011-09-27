CC = `which mxmlc`
DEST = ../dist
SRC = -sp src


all: bridge10

dest:
	mkdir -p $(DEST)

bridge10: dest
	$(CC) -load-config=conf/flash10.xml src/bridge.as -o $(DEST)/bridge10.swf $(SRC)