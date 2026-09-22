fn main() {
    println!("cargo:rerun-if-changed=assets/windows/icon.ico");

    #[cfg(windows)]
    {
        let mut resource = winresource::WindowsResource::new();
        resource.set_icon("assets/windows/icon.ico");
        resource.set("ProductName", "WakeOnDisplay");
        resource.set("FileDescription", "WakeOnDisplay");
        resource.set("LegalCopyright", "Copyright (c) ryuya");
        resource
            .compile()
            .expect("failed to compile Windows resources");
    }
}
