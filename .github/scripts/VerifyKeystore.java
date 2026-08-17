import java.io.FileInputStream;
import java.io.IOException;
import java.security.KeyStore;
import java.security.UnrecoverableKeyException;
import java.util.Collections;
import java.util.List;

/**
 * 서명 Secret 4개가 실제로 맞는지 빌드 **전에** 확인한다.
 *
 * 왜 keytool을 쓰지 않는가: keytool CLI는 -keypass가 틀리면 조용히 store 비밀번호로
 * 되돌아가 성공한다(-certreq·-importkeystore 모두 그랬다). 그래서 CLI로는 "키 비밀번호가
 * 틀렸다"를 절대 잡아낼 수 없고, 잘못된 값이 그대로 Gradle까지 흘러가 1분 반 뒤
 * packageRelease에서 "Given final block not properly padded" 한 줄로 죽었다.
 *
 * AGP가 하는 일이 정확히 KeyStore.getKey(alias, keyPassword)다. 같은 호출을 여기서
 * 먼저 해 보면 넷 중 무엇이 틀렸는지 바로 나온다.
 *
 * 실행: java .github/scripts/VerifyKeystore.java <keystore 경로>
 *       (비밀번호·alias는 환경변수로 받는다 — 명령줄 인자는 프로세스 목록에 노출된다.)
 */
public final class VerifyKeystore {

    public static void main(String[] args) {
        if (args.length != 1) {
            fail("사용법: java VerifyKeystore.java <keystore 경로>");
        }
        String path = args[0];
        String storePw = require("STORE_PASSWORD", "KEYSTORE_PASSWORD");
        String alias = require("KEY_ALIAS", "KEY_ALIAS");
        // 키 비밀번호를 비워 두면 store 비밀번호를 쓴다(build.gradle과 같은 규칙).
        String keyPwRaw = System.getenv("KEY_PASSWORD");
        String keyPw = (keyPwRaw == null || keyPwRaw.isEmpty()) ? storePw : keyPwRaw;

        warnIfPadded("KEYSTORE_PASSWORD", storePw);
        warnIfPadded("KEY_ALIAS", alias);
        warnIfPadded("KEY_PASSWORD", keyPwRaw);

        KeyStore ks;
        try {
            ks = KeyStore.getInstance("PKCS12");
            try (FileInputStream in = new FileInputStream(path)) {
                ks.load(in, storePw.toCharArray());
            }
        } catch (IOException e) {
            // PKCS12로 못 읽으면 옛 JKS 형식일 수 있다 — 한 번 더 시도한다.
            ks = loadAsJks(path, storePw, e);
        } catch (Exception e) {
            fail("keystore를 읽지 못했습니다(" + e.getClass().getSimpleName() + "): " + e.getMessage());
            return;
        }

        // alias는 대소문자를 가리지 않고 저장되지만(keytool이 소문자로 눕힌다),
        // 확인은 있는 그대로 + 소문자 둘 다 해 본다.
        String resolved = resolveAlias(ks, alias);
        if (resolved == null) {
            System.out.println("keystore 안의 항목: " + aliasesOf(ks));
            fail("KEY_ALIAS를 keystore에서 찾지 못했습니다 — 위 목록의 이름과 대조하세요(오타·대소문자).");
        }

        try {
            if (ks.getKey(resolved, keyPw.toCharArray()) == null) {
                fail("alias '" + resolved + "'에 개인키가 없습니다 — 인증서만 든 항목입니다.");
            }
        } catch (UnrecoverableKeyException e) {
            fail("KEY_PASSWORD가 키 비밀번호와 다릅니다. keytool로 만들 때 '키 비밀번호'를 "
                + "따로 입력하지 않았다면 KEYSTORE_PASSWORD와 같은 값입니다"
                + "(요즘 기본 형식인 PKCS12는 둘을 같게 강제합니다). "
                + "복사할 때 끝에 줄바꿈·공백이 딸려 들어가지 않았는지도 확인하세요.");
        } catch (Exception e) {
            fail("개인키를 꺼내지 못했습니다(" + e.getClass().getSimpleName() + "): " + e.getMessage());
        }

        System.out.println("::notice::keystore 검증 통과 — 서명된 release APK를 만듭니다.");
    }

    private static KeyStore loadAsJks(String path, String storePw, IOException pkcs12Error) {
        try {
            KeyStore jks = KeyStore.getInstance("JKS");
            try (FileInputStream in = new FileInputStream(path)) {
                jks.load(in, storePw.toCharArray());
            }
            return jks;
        } catch (Exception ignored) {
            // 두 형식 모두 실패 = 비밀번호가 틀렸거나 파일이 깨졌다. 둘을 구분할 방법은
            // 없으므로(형식마다 무결성 검사가 다르다) 양쪽을 다 짚어 준다.
            fail("keystore를 열지 못했습니다 — KEYSTORE_PASSWORD가 다르거나 "
                + "ANDROID_KEYSTORE_BASE64가 잘려/손상돼 있습니다. (" + pkcs12Error.getMessage() + ")");
            return null;
        }
    }

    private static String resolveAlias(KeyStore ks, String alias) {
        try {
            if (ks.containsAlias(alias)) {
                return alias;
            }
            for (String a : aliasesOf(ks)) {
                if (a.equalsIgnoreCase(alias)) {
                    return a;
                }
            }
        } catch (Exception ignored) {
            // 아래에서 못 찾은 것으로 처리한다.
        }
        return null;
    }

    private static List<String> aliasesOf(KeyStore ks) {
        try {
            return Collections.list(ks.aliases());
        } catch (Exception e) {
            return List.of();
        }
    }

    private static String require(String envName, String secretName) {
        String v = System.getenv(envName);
        if (v == null || v.isEmpty()) {
            fail("Secret " + secretName + "이(가) 비어 있습니다 — 저장소 Settings → Secrets에서 등록하세요.");
        }
        return v;
    }

    /** 값 자체는 절대 찍지 않는다(로그 마스킹을 믿지 않는다) — 공백이 붙었다는 사실만 알린다. */
    private static void warnIfPadded(String name, String value) {
        if (value != null && !value.isEmpty() && !value.equals(value.strip())) {
            System.out.println("::warning::" + name + " 값의 앞뒤에 공백·줄바꿈이 붙어 있습니다. "
                + "복사할 때 딸려 들어간 것이라면 다시 등록하세요.");
        }
    }

    private static void fail(String message) {
        System.out.println("::error::" + message);
        System.exit(1);
    }
}
