use network_interface::{NetworkInterface, NetworkInterfaceConfig};
use std::collections::HashSet;
use std::io;
use std::net::UdpSocket;

pub const WOL_PORT: u16 = 9;
const MAGIC_PACKET_LEN: usize = 102;

pub fn listen(on_magic_packet: impl Fn() + Send + 'static) -> io::Result<()> {
    let socket = UdpSocket::bind(("0.0.0.0", WOL_PORT))?;
    tracing::info!(port = WOL_PORT, "Wake-on-LANの待受を開始しました");
    let mut buffer = [0_u8; 2048];

    loop {
        let (length, source) = socket.recv_from(&mut buffer)?;
        let macs = local_mac_addresses();
        if is_magic_packet(&buffer[..length], &macs) {
            tracing::info!(%source, "このコンピュータ宛のマジックパケットを受信しました");
            on_magic_packet();
        }
    }
}

pub fn local_mac_addresses() -> HashSet<[u8; 6]> {
    NetworkInterface::show()
        .unwrap_or_else(|error| {
            tracing::warn!(%error, "ネットワークインターフェースを取得できません");
            Vec::new()
        })
        .into_iter()
        .filter(|interface| !interface.internal)
        .filter_map(|interface| interface.mac_addr)
        .filter_map(|mac| parse_mac_address(&mac))
        .filter(|mac| *mac != [0; 6])
        .collect()
}

fn parse_mac_address(value: &str) -> Option<[u8; 6]> {
    let compact: String = value
        .chars()
        .filter(|character| character.is_ascii_hexdigit())
        .collect();
    if compact.len() != 12 {
        return None;
    }

    let mut result = [0_u8; 6];
    for (index, byte) in result.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&compact[index * 2..index * 2 + 2], 16).ok()?;
    }
    Some(result)
}

pub fn is_magic_packet(packet: &[u8], local_macs: &HashSet<[u8; 6]>) -> bool {
    if packet.len() < MAGIC_PACKET_LEN || packet[..6] != [0xff; 6] {
        return false;
    }

    let target: [u8; 6] = packet[6..12].try_into().expect("slice length is fixed");
    if !local_macs.contains(&target) {
        return false;
    }

    packet[6..MAGIC_PACKET_LEN]
        .as_chunks::<6>()
        .0
        .iter()
        .all(|candidate| *candidate == target)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn packet_for(mac: [u8; 6]) -> Vec<u8> {
        let mut packet = vec![0xff; 6];
        for _ in 0..16 {
            packet.extend_from_slice(&mac);
        }
        packet
    }

    #[test]
    fn accepts_packet_for_local_mac() {
        let mac = [0x02, 0x11, 0x22, 0x33, 0x44, 0x55];
        assert!(is_magic_packet(&packet_for(mac), &HashSet::from([mac])));
    }

    #[test]
    fn rejects_packet_for_another_machine() {
        let mine = [0x02, 0x11, 0x22, 0x33, 0x44, 0x55];
        let other = [0x02, 0xaa, 0xbb, 0xcc, 0xdd, 0xee];
        assert!(!is_magic_packet(&packet_for(other), &HashSet::from([mine])));
    }

    #[test]
    fn rejects_malformed_repetitions() {
        let mac = [0x02, 0x11, 0x22, 0x33, 0x44, 0x55];
        let mut packet = packet_for(mac);
        packet[20] ^= 1;
        assert!(!is_magic_packet(&packet, &HashSet::from([mac])));
    }

    #[test]
    fn parses_common_mac_formats() {
        assert_eq!(
            parse_mac_address("02:11:22:33:44:55"),
            Some([2, 17, 34, 51, 68, 85])
        );
        assert_eq!(
            parse_mac_address("02-11-22-33-44-55"),
            Some([2, 17, 34, 51, 68, 85])
        );
    }
}
