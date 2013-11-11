# Hydna JavaScript client library

A multi-transport Hydna (http://www.hydna.com) client library that will
automatically detect the best available transport for the connecting client.
The following transports are supported:

* WebSockets
* Binary TCP using Flash fallback (if WebSockets are not available)
* HTTP Comet (longpolling at present - if Flash is not available)

## Installation

Add the following to the head-element of your HTML source:

    <script type="text/javascript" src="http://cdn.hydna.com/1/hydna.js"></script>

This library comes with Require.js and CommonJS support. See `examples/requirejs.html` for example.

## Usage

Open a channel in read/write mode and attach event-handlers that
respond to open- and error events:

    var channel = new HydnaChannel('public.hydna.net', 'rw');

    channel.onopen = function(event) {
        // channel is open and ready to use 
    };

    channel.onerror = function(event) {
        // an error occured when connecting or opening the channel
    };

You need to add another event handler that is invoked when messages are
received:

    channel.onmessage = function(event) {
        alert(event.data);
    };

And call `send()` if you want to send data over the channel:

    chan.send("this is a message");

## API Documentation


The Hydna JavaScript client library consists of a single class:
`HydnaChannel`. The API has been modeled to be similar to that of
the WebSocket standard specification.

### HydnaChannel(uri, mode)

When creating a channel, you pass in the URI and mode in which the channel
should be opened:

    var channel = new HydnaChannel('public.hydna.net', 'r');

### Event handlers

The following event handlers are exposed by the `HydnaChannel`: onopen,
onmessage, onsignal, onclose, and onerror.

The appropriate event handler will be invoked whenever an event that
corresponds to the handler is triggered.

The object also support jQuery-style event binding via `on` and `off`. These methods are chaniable. See `examples/eventhandlers.html` for examples.


#### channel.onopen

Invoked when a connection has been established and the requested channel was
successfully opened.

In the example below a channel is initialized and an alert message displayed
when it has been successfully opened:

    var channel = new HydnaChannel('public.hydna.net', 'r');
    channel.onopen = function(event) {
        alert('channel was successfully opened!');
    }

#### channel.onmessage

Invoked as messages arrive on the channel. `event.data` contains
the actual message received. `event.priority` contains the priority
of the message.

    channel.onmessage = function(event) {
        alert('message received: ' + event.data);
    };

#### channel.onsignal

Triggered as signals are emitted on the channel. `event.data` contains the
message.

    channel.onsignal = function(event) {
        alert('signal received: ' + event.data);
    }

#### channel.onclose

Triggered when a channel is closed. `event.reason` contains optional reason.

    channel.onclose = function(event) {
         alert('the channel was closed: ' + event.data);
    }

#### channel.onerror

Triggered when an error occurs. `event.data` contains optional error message.

    channel.onerror = function(event) {
        alert('error occured: ' + event.data);
    }

### Methods

The following methods exist on instances of `HydnaChannel`: send, emit, and
close.

#### channel.send(message, priority=0)

Transmit `message` -- which is a string or binary array -- over an
open channel. A `priority` can be set to dictate how the server should treat
the message during high-load situations. The value can be in the range 0-7 and
defaults to `0` which is the highest priority.

    channel.onopen = function(event) {
        channel.send('hello world!');
    };

#### channel.emit([data])

Emits a signal with optional `data` on the channel.

    channel.onopen = function(event) {
        channel.emit('logged_in');
    };

#### channel.close(message='')

Closes the channel. Will also close the connection if there are no more
channels open that use the same transport on the same domain.

The optional `message` is sent to the behavior instance.

    channel.onopen = function(event) {
        channel.close('goodbye cruel world!');
    };

### Properties

The following properties exist on instances of `HydnaChannel`:

* `channel.readable` is `true` if channel is readable and `false` if it's not.
* `channel.writable` is `true` if channel is writable and `false` if it's not.
* `channel.emitable` is `true` if channel is emitable and `false` if it's not.
* `channel.readyState` Returns the "ready-state" of the channel. It can be
  either one of the following: `HydnaChannel.CONNECTING`, `HydnaChannel.OPEN`,
  `HydnaChannel.CLOSING`, and `HydnaChannel.CLOSED`.

### Static members

* `HydnaChannel.VERSION` current library version
* `HydnaChannel.TRANSPORT` contains the name of the transport selected.
* `HydnaChannel.WEBSOCKET` is set to `true` if browser supports WebSockets
* `HydnaChannel.FLASH` is set to `true` if browser supports Flash
* `HydnaChannel.COMET` is set to `true` if browser supports Comet
* `HydnaChannel.MAXSIZE` the maximum size of messages allowed (in bytes).
* `HydnaChannel.sizeOf(data)` returns the size of `data` (String or binary
  array) in bytes.

## Generating a distribution

You can skip this step if you're sourcing the script from the CDN.

### Requirements

#### Apache Flex

Installation on OS X:

    brew install flex_sdk

#### NodeJS

Installation on OS X:

    brew install nodejs

#### UglifyJS (optional)

Installation:

    npm install -g uglifyjs

### Building

First configure, then make:

    $ ./configure
    $ make

The files generated will be placed in `dist`.

