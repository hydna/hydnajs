
namespace = "this"
  script = "redirect"
    source = "./redirect.js"
  end

  script = "reply_with_pong"
    source = "./signal.js"
  end
end

directive

  channel = "0x00000001"
    exec = "this:redirect"
  end

  action = "emit"
    channel = "0x00112233"
      exec = "this:reply_with_pong"
    end
  end

  allow
end