import { sendMiioCommand } from './miioProtocol.js';

// MIoT-egenskaper for Dreame-robotstøvsugere (siid/piid), verifisert mot
// python-miio sin faktiske "_DREAME_F9_MAPPING" – dette dekker de fleste
// nyere Dreame-modeller (inkl. D10 Plus Gen 2 / RLD32GD-familien) siden de
// deler samme MIoT-spec-struktur. Ingen offisiell dokumentasjon finnes;
// hvis en konkret enhet skulle avvike må denne justeres.
const PROPERTIES = {
  battery_level: { siid: 3, piid: 1 },
  charging_state: { siid: 3, piid: 2 },
  device_status: { siid: 2, piid: 1 },
};

const ACTIONS = {
  start_clean: { siid: 4, aiid: 1 },
  stop_clean: { siid: 4, aiid: 2 },
  home: { siid: 3, aiid: 1 },
};

// device_status – se dreamevacuum_miot.py DeviceStatus-enum.
const STATUS_LABELS = {
  1: 'Rengjør',
  2: 'Inaktiv',
  3: 'Pause',
  4: 'Feil',
  5: 'På vei til lader',
  6: 'Lader',
  7: 'Vasker',
  13: 'Ferdig ladet',
};

async function getProperties(ip, token) {
  const params = Object.entries(PROPERTIES).map(([name, { siid, piid }]) => ({ did: name, siid, piid }));
  const response = await sendMiioCommand(ip, token, 'get_properties', params);
  if (response.error) {
    throw new Error(response.error.message || 'Støvsugeren avviste forespørselen');
  }
  const byName = {};
  for (const row of response.result || []) {
    byName[row.did] = row.value;
  }
  return byName;
}

async function callAction(ip, token, actionName) {
  const { siid, aiid } = ACTIONS[actionName];
  const payload = [{ did: `call-${siid}-${aiid}`, siid, aiid, in: [] }];
  const response = await sendMiioCommand(ip, token, 'action', payload);
  if (response.error) {
    throw new Error(response.error.message || 'Støvsugeren avviste kommandoen');
  }
  return response.result;
}

// Kaster hvis enheten ikke svarer/token er feil – brukes til å validere en
// tilkobling før den lagres, samme mønster som testICloudConnection/testSpondConnection.
export async function testVacuumConnection(ip, token) {
  await getProperties(ip, token);
}

export async function getVacuumStatus(ip, token) {
  const props = await getProperties(ip, token);
  const statusCode = props.device_status;
  return {
    battery: props.battery_level ?? null,
    statusCode: statusCode ?? null,
    statusLabel: STATUS_LABELS[statusCode] || 'Ukjent',
    charging: props.charging_state === 1,
  };
}

export function startCleaning(ip, token) {
  return callAction(ip, token, 'start_clean');
}
export function stopCleaning(ip, token) {
  return callAction(ip, token, 'stop_clean');
}
export function returnHome(ip, token) {
  return callAction(ip, token, 'home');
}
