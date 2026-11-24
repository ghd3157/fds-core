"""
copilot_service.py — 생성형 AI 기반 관제 사건 요약 & 대응 리포트 Copilot

FDS-DESIGN.md Section 10.2.C 기준:
- GEMINI_API_KEY 설정 시 Gemini REST API (gemini-2.5-flash) 호출
- 미설정/오류 시에도 실제 Rule/LightGBM/IsolationForest/TreeSHAP 근거 기반의
  로컬 지능형 XAI 리포트 Fallback을 생성하여 오프라인 발표에서도 100% 동작 보장
"""
from datetime import datetime
import json
import logging
import urllib.request

from app.config import settings
from app.features import KST
from app.schemas import CopilotReportRequest, CopilotReportResponse

logger = logging.getLogger(__name__)


def _determine_risk_level(score: float) -> str:
    if score >= 92.0:
        return "CRITICAL"
    if score >= 80.0:
        return "HIGH"
    if score >= 60.0:
        return "MEDIUM"
    return "LOW"


def _build_local_xai_report(req: CopilotReportRequest) -> CopilotReportResponse:
    risk_level = _determine_risk_level(req.riskScore)

    # SHAP 상위 양(+) 기여 피처 정리
    top_pos = [c for c in req.shapContributions if c.shap > 0][:3]
    shap_desc = ", ".join(f"{c.label}(+{c.shap:.2f})" for c in top_pos) if top_pos else "복합 이상 패턴"

    layer_notes: list[str] = []
    if req.ruleScore is not None:
        layer_notes.append(f"정책 룰 {req.ruleScore:.1f}점")
    if req.mlScore is not None:
        layer_notes.append(f"LightGBM(지도) {req.mlScore:.1f}점")
    if req.anomalyScore is not None:
        layer_notes.append(f"IsolationForest(비지도) {req.anomalyScore:.1f}점")
    layers_text = " / ".join(layer_notes) if layer_notes else f"위험도 {req.riskScore:.1f}점"

    recent_fraud_cnt = sum(1 for tx in req.recentTransactions if tx.isFraud)
    recent_note = (
        f" 동일 사용자의 최근 조회 거래 {len(req.recentTransactions)}건 중 이상 탐지 이력이 {recent_fraud_cnt}건 확인됩니다."
        if req.recentTransactions
        else ""
    )

    summary = (
        f"사용자 {req.userId}의 {req.merchantCategory} 업종 {req.amount:,.0f}원 결제가 "
        f"[{req.detectionSource}] 레이어에서 최종 {req.riskScore:.1f}점({risk_level})으로 탐지되었습니다. "
        f"세부 점수는 [{layers_text}]이며, 최근 1분 내 결제 빈도는 {req.txCount1m}회입니다. "
        f"핵심 탐지 근거는 '{req.detectionReason}'이며 XAI 주요 상승 요인은 {shap_desc}입니다.{recent_note}"
    )

    actions: list[str] = []
    if risk_level == "CRITICAL" or req.txCount1m >= 5:
        actions.append("즉시 해당 카드의 추가 온라인·해외 결제를 임시 정지(Hold) 처리하세요.")
        actions.append("카드 소유주에게 본인 확인 ARS/전화 연락을 최우선으로 진행하세요.")
    else:
        actions.append("카드 소유주에게 본인 거래 여부 확인 알림톡/SMS를 발송하세요.")

    if req.anomalyScore is not None and req.anomalyScore >= 80.0 and (req.mlScore is None or req.mlScore < 80.0):
        actions.append("비지도 모델(Isolation Forest)이 신종 패턴으로 포착했습니다. 확인 후 사기 확정/오탐 피드백을 남겨 모델 재학습에 반영하세요.")
    else:
        actions.append("본인 확인 결과에 따라 알람 상세 화면에서 '사기 확정' 또는 '오탐 처리'를 기록해 재학습 데이터셋에 반영하세요.")

    actions.append(f"사용자 {req.userId}의 최근 1시간 내 추가 거래({req.merchantCategory} 외 타 업종 포함) 연쇄 도용 여부를 점검하세요.")

    sms_draft = (
        f"[FDS 보안안내] 고객님, 방금 {req.merchantCategory}에서 {req.amount:,.0f}원 결제가 "
        f"이상 거래로 감지되어 안전을 위해 확인 요청드립니다. "
        f"본인 결제가 맞다면 1번, 본인이 아닌 경우 즉시 2번(카드 정지 및 상담 연결)을 회신해 주세요."
    )

    return CopilotReportResponse(
        alertId=req.alertId,
        riskLevel=risk_level,
        summary=summary,
        recommendedActions=actions,
        customerSmsDraft=sms_draft,
        generator="local-xai-copilot",
        generatedAt=datetime.now(KST).isoformat(timespec="seconds"),
    )


def _call_gemini_api(req: CopilotReportRequest) -> CopilotReportResponse | None:
    api_key = settings.gemini_api_key.strip()
    if not api_key:
        return None

    prompt = (
        "당신은 금융 카드사 FDS(이상거래탐지) 시니어 보안 관제 분석가입니다.\n"
        "아래 결제 이상 탐지 데이터를 분석하여 반드시 JSON 형식으로만 응답하세요.\n"
        "필수 JSON 키: riskLevel(CRITICAL|HIGH|MEDIUM|LOW), summary(한국어 3문장 이내 핵심 요약), "
        "recommendedActions(한국어 3개 구체적 조치 리스트), customerSmsDraft(한국어 고객 안내 SMS 초안 150자 이내).\n\n"
        f"데이터: {req.model_dump_json()}"
    )

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_model}:generateContent?key={api_key}"
    )
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.2,
        },
    }

    try:
        http_req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(http_req, timeout=12) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        parsed = json.loads(text)

        return CopilotReportResponse(
            alertId=req.alertId,
            riskLevel=parsed.get("riskLevel", _determine_risk_level(req.riskScore)),
            summary=str(parsed["summary"]),
            recommendedActions=[str(a) for a in parsed.get("recommendedActions", [])][:5],
            customerSmsDraft=str(parsed["customerSmsDraft"]),
            generator=f"gemini:{settings.gemini_model}",
            generatedAt=datetime.now(KST).isoformat(timespec="seconds"),
        )
    except Exception as exc:
        logger.warning("Gemini API call failed (falling back to local XAI copilot) | error=%s", exc)
        return None


def generate_incident_report(req: CopilotReportRequest) -> CopilotReportResponse:
    gemini_result = _call_gemini_api(req)
    if gemini_result is not None:
        return gemini_result
    return _build_local_xai_report(req)
