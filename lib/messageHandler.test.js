const {
  parseCommand,
  extractFirstUrl,
  isOwnerJid,
} = require("./messageHandler");

describe("parseCommand", () => {
  it("should parse a command with a prefix", () => {
    expect(parseCommand("/help", "/")).toEqual({
      command: "help",
      args: "",
    });
  });

  it("should parse a command with a prefix and arguments", () => {
    expect(parseCommand("/ytv https://www.youtube.com/watch?v=dQw4w9WgXcQ", "/")).toEqual({
      command: "ytv",
      args: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
  });

  it("should return null if the prefix is not at the beginning", () => {
    expect(parseCommand("hello /help", "/")).toBeNull();
  });

  it("should return null if there is no command", () => {
    expect(parseCommand("/", "/")).toBeNull();
  });
});

describe("extractFirstUrl", () => {
  it("should extract the first URL from a string", () => {
    expect(extractFirstUrl("hello https://www.google.com world")).toBe(
      "https://www.google.com"
    );
  });

  it("should return null if there is no URL", () => {
    expect(extractFirstUrl("hello world")).toBeNull();
  });
});

describe("isOwnerJid", () => {
  beforeEach(() => {
    process.env.BOT_OWNER_NUMBER = "6281234567890";
  });

  afterEach(() => {
    delete process.env.BOT_OWNER_NUMBER;
  });

  it("should return true for the owner's JID", () => {
    expect(isOwnerJid("6281234567890@s.whatsapp.net")).toBe(true);
  });

  it("should return false for a non-owner's JID", () => {
    expect(isOwnerJid("1234567890@s.whatsapp.net")).toBe(false);
  });
});
