from app.envfile import PLACEHOLDER_GEMINI_KEY, gemini_key_configured, load_dotenv, parse_env_text


def test_parses_basic_key_value():
    assert parse_env_text("GEMINI_API_KEY=abc123") == {"GEMINI_API_KEY": "abc123"}


def test_skips_blank_lines_and_comments():
    text = "\n# a comment\nFOO=bar\n\n  # indented comment\nBAZ=qux\n"
    assert parse_env_text(text) == {"FOO": "bar", "BAZ": "qux"}


def test_strips_surrounding_double_and_single_quotes():
    text = 'A="double quoted"\nB=\'single quoted\'\n'
    assert parse_env_text(text) == {"A": "double quoted", "B": "single quoted"}


def test_handles_leading_export():
    assert parse_env_text("export GEMINI_API_KEY=abc123") == {"GEMINI_API_KEY": "abc123"}
    assert parse_env_text("  export   FOO=bar  ") == {"FOO": "bar"}


def test_tolerates_whitespace_around_equals():
    assert parse_env_text("FOO = bar") == {"FOO": "bar"}


def test_empty_value_is_allowed():
    assert parse_env_text("FOO=") == {"FOO": ""}


def test_ignores_malformed_lines_instead_of_raising():
    text = "this is not valid\n=noKeyHere\nFOO bar baz\nGOOD=value\n1BAD=nope\n"
    # every malformed line above is silently dropped; only GOOD survives.
    # (a leading-digit key like "1BAD" is not a valid shell identifier either)
    assert parse_env_text(text) == {"GOOD": "value"}


def test_mismatched_quotes_are_left_alone():
    # opening/closing quote characters differ, so nothing is stripped
    assert parse_env_text("FOO=\"unterminated") == {"FOO": '"unterminated'}


def test_load_dotenv_fills_missing_environ_keys(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text("GEMINI_API_KEY=from-file\nOTHER=1\n", encoding="utf-8")
    environ = {}
    load_dotenv(env_file, environ=environ)
    assert environ == {"GEMINI_API_KEY": "from-file", "OTHER": "1"}


def test_load_dotenv_never_overwrites_a_real_env_var(tmp_path):
    # precedence rule: a real environment variable always wins over .env
    env_file = tmp_path / ".env"
    env_file.write_text("GEMINI_API_KEY=from-file\n", encoding="utf-8")
    environ = {"GEMINI_API_KEY": "already-set-in-shell"}
    load_dotenv(env_file, environ=environ)
    assert environ["GEMINI_API_KEY"] == "already-set-in-shell"


def test_load_dotenv_is_a_noop_when_file_missing(tmp_path):
    environ = {"UNRELATED": "1"}
    load_dotenv(tmp_path / "does-not-exist.env", environ=environ)
    assert environ == {"UNRELATED": "1"}


def test_gemini_key_configured_true_for_a_real_looking_value():
    assert gemini_key_configured({"GEMINI_API_KEY": "AIzaSomethingReal"}) is True


def test_gemini_key_configured_false_when_unset():
    assert gemini_key_configured({}) is False


def test_gemini_key_configured_false_for_empty_string():
    assert gemini_key_configured({"GEMINI_API_KEY": ""}) is False


def test_gemini_key_configured_false_for_unfilled_placeholder():
    # scripts/setup.py copies .env.example verbatim on a fresh clone, so this
    # exact string is what a friend's environment has right after bootstrap
    # and before they've pasted in a real key.
    assert gemini_key_configured({"GEMINI_API_KEY": PLACEHOLDER_GEMINI_KEY}) is False
