mod geometry;
use geometry::{Bounds, Mesh, signed_volume};
use glam::DVec3 as Vector;
use std::{
    collections::{HashMap, HashSet},
    env, fs,
    process::ExitCode,
};

const DEFAULT_INSET: f64 = 0.001;
const NUMERICAL_TOLERANCE: f64 = 0.000001;

struct Part {
    id: String,
    name: String,
    shells: Vec<Mesh>,
    bounds: Bounds,
}

fn required_attribute<'a>(node: roxmltree::Node<'a, '_>, name: &str) -> Result<&'a str, String> {
    node.attribute(name)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| format!("{} requires attribute {name}.", node.tag_name().name()))
}

fn numbers<T: std::str::FromStr>(
    node: roxmltree::Node<'_, '_>,
    tag: &str,
) -> Result<Vec<T>, String> {
    let children: Vec<_> = node
        .children()
        .filter(|child| child.has_tag_name(tag))
        .collect();
    if children.len() != 1 || children[0].children().any(|child| child.is_element()) {
        return Err(format!(
            "Each part requires exactly one text-only {tag} element."
        ));
    }
    let text = children[0].text().unwrap_or("");
    let values: Vec<T> = text
        .split_whitespace()
        .map(|value| {
            value
                .parse()
                .map_err(|_| format!("Invalid {tag} number: {value}."))
        })
        .collect::<Result<_, _>>()?;
    if values.is_empty() || !values.len().is_multiple_of(3) {
        return Err(format!("{tag} must contain nonempty triples."));
    }
    Ok(values)
}

fn shells(
    vertices: Vec<Vector>,
    triangles: Vec<[u32; 3]>,
    inset: f64,
) -> Result<Vec<Mesh>, String> {
    let mut unique = Vec::new();
    let mut points = HashMap::new();
    let mut remap = Vec::with_capacity(vertices.len());
    for point in vertices {
        let key = point
            .to_array()
            .map(|value| if value == 0.0 { 0 } else { value.to_bits() });
        let index = *points.entry(key).or_insert_with(|| {
            unique.push(point);
            (unique.len() - 1) as u32
        });
        remap.push(index);
    }
    let triangles: Vec<_> = triangles
        .iter()
        .map(|triangle| triangle.map(|index| remap[index as usize]))
        .collect();
    let mut edges: HashMap<(u32, u32), Vec<(usize, bool)>> = HashMap::new();
    for (face, triangle) in triangles.iter().enumerate() {
        let [a, b, c] = triangle.map(|index| unique[index as usize]);
        let area = (b - a).cross(c - a).length_squared();
        if !area.is_finite() || area <= 1e-24 {
            return Err(format!(
                "Triangle {face} is degenerate or has non-finite area."
            ));
        }
        for i in 0..3 {
            let (a, b) = (triangle[i], triangle[(i + 1) % 3]);
            edges
                .entry((a.min(b), a.max(b)))
                .or_default()
                .push((face, a < b));
        }
    }
    let mut adjacent = vec![Vec::new(); triangles.len()];
    for faces in edges.values() {
        if faces.len() != 2 || faces[0].1 == faces[1].1 {
            return Err("Mesh must be closed, consistently oriented, and manifold after welding duplicate vertices.".into());
        }
        adjacent[faces[0].0].push(faces[1].0);
        adjacent[faces[1].0].push(faces[0].0);
    }
    for neighbors in &mut adjacent {
        neighbors.sort_unstable();
    }
    let mut visited = vec![false; triangles.len()];
    let mut result = Vec::new();
    for first in 0..triangles.len() {
        if visited[first] {
            continue;
        }
        let mut pending = vec![first];
        let mut indices = Vec::new();
        while let Some(face) = pending.pop() {
            if std::mem::replace(&mut visited[face], true) {
                continue;
            }
            indices.push(triangles[face]);
            pending.extend(adjacent[face].iter().copied());
        }
        let volume = signed_volume(&unique, &indices);
        if !volume.is_finite() || volume <= 1e-12 {
            return Err(
                "Each shell must have positive volume and outward-facing triangles.".into(),
            );
        }
        let mut compact = Vec::new();
        let mut mapping = HashMap::new();
        let compact_indices: Vec<_> = indices
            .iter()
            .map(|triangle| {
                triangle.map(|index| {
                    *mapping.entry(index).or_insert_with(|| {
                        compact.push(unique[index as usize]);
                        (compact.len() - 1) as u32
                    })
                })
            })
            .collect();
        let inset_vertices = geometry::inset_vertices(&compact, &compact_indices, inset)?;
        result.push(Mesh::new(&inset_vertices, &compact_indices));
    }
    Ok(result)
}

fn parse_scene(xml: &str, inset: f64) -> Result<Vec<Part>, String> {
    let document = roxmltree::Document::parse(xml).map_err(|error| error.to_string())?;
    let root = document.root_element();
    if !root.has_tag_name("scene")
        || root.attribute("version") != Some("1")
        || root.attribute("units") != Some("inches")
        || root.attribute("space") != Some("world")
    {
        return Err("Expected scene version=\"1\" units=\"inches\" space=\"world\".".into());
    }
    let mut ids = HashSet::new();
    let mut parts = Vec::new();
    for node in root.children().filter(|node| node.is_element()) {
        if !node.has_tag_name("part") {
            return Err(format!(
                "Unexpected scene element {}.",
                node.tag_name().name()
            ));
        }
        let id = required_attribute(node, "id")?.to_owned();
        let name = required_attribute(node, "name")?.to_owned();
        if !ids.insert(id.clone()) {
            return Err(format!("Duplicate part ID: {id}."));
        }
        let coordinates: Vec<f64> =
            numbers(node, "vertices").map_err(|error| format!("{id}: {error}"))?;
        if !coordinates.iter().all(|value| value.is_finite()) {
            return Err(format!("{id}: Vertex coordinates must be finite."));
        }
        let vertices: Vec<_> = coordinates
            .chunks_exact(3)
            .map(|xyz| Vector::new(xyz[0], xyz[1], xyz[2]))
            .collect();
        let indices: Vec<u32> =
            numbers(node, "triangles").map_err(|error| format!("{id}: {error}"))?;
        if indices
            .iter()
            .any(|&index| index as usize >= vertices.len())
        {
            return Err(format!("{id}: Triangle index outside the vertex array."));
        }
        let triangles = indices
            .chunks_exact(3)
            .map(|xyz| [xyz[0], xyz[1], xyz[2]])
            .collect();
        let bounds = Bounds::of(&vertices);
        let shells = shells(vertices, triangles, inset)
            .map_err(|error| format!("{id} ({name}): {error}"))?;
        parts.push(Part {
            id,
            name,
            shells,
            bounds,
        });
    }
    if parts.is_empty() {
        return Err("Scene has no parts.".into());
    }
    Ok(parts)
}

fn overlap(first: &Part, second: &Part, tolerance: f64) -> Result<Option<(Vector, f64)>, String> {
    if !first.bounds.overlaps(second.bounds) {
        return Ok(None);
    }
    for a in &first.shells {
        for b in &second.shells {
            if let Some(hit) = geometry::overlap(a, b, tolerance)? {
                return Ok(Some(hit));
            }
        }
    }
    Ok(None)
}

fn run() -> Result<u8, String> {
    let args: Vec<_> = env::args().skip(1).collect();
    let usage = "Usage: mesh-clash SCENE.xml [--inset INCHES=0.001]";
    if args == ["--help"] {
        println!("{usage}");
        return Ok(0);
    }
    if args.len() != 1 && (args.len() != 3 || args[1] != "--inset") {
        return Err(usage.into());
    }
    let inset = if args.len() == 3 {
        args[2]
            .parse::<f64>()
            .map_err(|_| "Inset must be a finite nonnegative number.".to_string())?
    } else {
        DEFAULT_INSET
    };
    if !inset.is_finite() || inset < 0.0 {
        return Err("Inset must be a finite nonnegative number.".into());
    }
    let xml = fs::read_to_string(&args[0]).map_err(|error| format!("{}: {error}", args[0]))?;
    let parts = parse_scene(&xml, inset)?;
    let mut clashes = 0;
    let mut errors = 0;
    for (i, first) in parts.iter().enumerate() {
        for second in &parts[i + 1..] {
            match overlap(first, second, NUMERICAL_TOLERANCE) {
                Ok(Some((point, thickness))) => {
                    clashes += 1;
                    println!(
                        "INTERFERENCE: {} [{}] intersects {} [{}]\n  Near ({:.5}, {:.5}, {:.5}) in; effective overlap thickness {:.6} in.",
                        first.name,
                        first.id,
                        second.name,
                        second.id,
                        point.x,
                        point.y,
                        point.z,
                        thickness
                    );
                }
                Ok(None) => {}
                Err(error) => {
                    errors += 1;
                    eprintln!("ERROR checking {} against {}: {error}", first.id, second.id);
                }
            }
        }
    }
    println!(
        "{} parts checked; {clashes} interfering pairs; {errors} errors; analysis inset {inset} in per part.",
        parts.len()
    );
    Ok(if errors > 0 { 2 } else { u8::from(clashes > 0) })
}

fn main() -> ExitCode {
    match run() {
        Ok(code) => ExitCode::from(code),
        Err(error) => {
            eprintln!("ERROR: {error}");
            ExitCode::from(2)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const DEFAULT_TOLERANCE: f64 = 0.001;

    fn box_mesh(half_size: Vector) -> (Vec<Vector>, Vec<[u32; 3]>) {
        let vertices = [
            [-1.0, -1.0, -1.0],
            [1.0, -1.0, -1.0],
            [1.0, 1.0, -1.0],
            [-1.0, 1.0, -1.0],
            [-1.0, -1.0, 1.0],
            [1.0, -1.0, 1.0],
            [1.0, 1.0, 1.0],
            [-1.0, 1.0, 1.0],
        ]
        .map(|point| Vector::from_array(point) * half_size)
        .to_vec();
        let indices = [
            [0, 3, 2, 1],
            [4, 5, 6, 7],
            [0, 1, 5, 4],
            [1, 2, 6, 5],
            [2, 3, 7, 6],
            [3, 0, 4, 7],
        ]
        .into_iter()
        .flat_map(|[a, b, c, d]| [[a, b, c], [a, c, d]])
        .collect();
        (vertices, indices)
    }

    fn box_part(center: Vector, half_size: Vector) -> Part {
        let (vertices, indices) = box_mesh(half_size);
        let vertices: Vec<_> = vertices.into_iter().map(|vertex| vertex + center).collect();
        mesh_part(vertices, indices, 0.0)
    }

    fn mesh_part(vertices: Vec<Vector>, indices: Vec<[u32; 3]>, inset: f64) -> Part {
        Part {
            id: "fixture".into(),
            name: "Fixture".into(),
            bounds: Bounds::of(&vertices),
            shells: shells(vertices, indices, inset).unwrap(),
        }
    }

    #[test]
    fn insets_each_face_without_changing_source_vertices_and_rejects_collapsed_shapes() {
        let (vertices, indices) = box_mesh(Vector::ONE);
        let original = vertices.clone();
        let inset = geometry::inset_vertices(&vertices, &indices, DEFAULT_INSET).unwrap();
        assert_eq!(vertices, original);
        for (before, after) in vertices.iter().zip(inset) {
            assert!((after - *before * (1.0 - DEFAULT_INSET)).length() < 1e-12);
        }
        assert_eq!(
            geometry::inset_vertices(&vertices, &indices, 0.0).unwrap(),
            vertices
        );
        let (vertices, indices) = box_mesh(Vector::new(0.0005, 1.0, 1.0));
        assert!(geometry::inset_vertices(&vertices, &indices, DEFAULT_INSET).is_err());
    }

    #[test]
    fn inset_handles_rotated_float32_contacts_but_preserves_larger_interference() {
        let rotation = glam::DQuat::from_euler(glam::EulerRot::XYZ, 0.31, -0.49, 0.73);
        let make = |offset: f64| {
            let (vertices, indices) = box_mesh(Vector::ONE);
            let vertices = vertices
                .into_iter()
                .map(|point| {
                    (rotation * (point + Vector::X * offset) + Vector::new(42.3, 57.1, -80.3))
                        .as_vec3()
                        .as_dvec3()
                })
                .collect();
            mesh_part(vertices, indices, DEFAULT_INSET)
        };
        let first = make(0.0);
        for (offset, expected) in [
            (2.01, false),
            (2.0, false),
            (1.999, false),
            (1.99, true),
            (0.0, true),
        ] {
            assert_eq!(
                overlap(&first, &make(offset), NUMERICAL_TOLERANCE)
                    .unwrap()
                    .is_some(),
                expected,
                "{offset}"
            );
        }
    }

    #[test]
    fn preserves_concave_notches_including_cancelled_tetrahedra() {
        let profile = [
            (0.0, 0.0),
            (3.0, 0.0),
            (3.0, 1.0),
            (1.0, 1.0),
            (1.0, 3.0),
            (0.0, 3.0),
        ];
        let vertices = [0.0, 1.0]
            .into_iter()
            .flat_map(|z| profile.map(|(x, y)| Vector::new(x, y, z)))
            .collect();
        let caps = [[0, 1, 3], [1, 2, 3], [0, 3, 5], [3, 4, 5]];
        let mut indices: Vec<_> = caps
            .into_iter()
            .flat_map(|[a, b, c]| [[a, c, b], [a + 6, b + 6, c + 6]])
            .collect();
        for i in 0..6 {
            let j = (i + 1) % 6;
            indices.extend([[i, j, j + 6], [i, j + 6, i + 6]]);
        }
        let notched = mesh_part(vertices, indices, DEFAULT_INSET);
        for (center, expected) in [
            (Vector::new(2.0, 2.0, 0.5), false),
            (Vector::new(1.25, 1.25, 0.5), false),
            (Vector::new(0.95, 1.5, 0.5), true),
        ] {
            let probe = box_part(center, Vector::splat(0.25));
            assert_eq!(
                overlap(&notched, &probe, NUMERICAL_TOLERANCE)
                    .unwrap()
                    .is_some(),
                expected,
                "{center}"
            );
            assert_eq!(
                overlap(&probe, &notched, NUMERICAL_TOLERANCE)
                    .unwrap()
                    .is_some(),
                expected,
                "{center}"
            );
        }
    }

    #[test]
    fn keeps_through_holes_empty_in_non_star_shaped_solids() {
        let profile = [
            (-2.0, -2.0),
            (2.0, -2.0),
            (2.0, 2.0),
            (-2.0, 2.0),
            (-1.0, -1.0),
            (1.0, -1.0),
            (1.0, 1.0),
            (-1.0, 1.0),
        ];
        let vertices = [-0.5, 0.5]
            .into_iter()
            .flat_map(|z| profile.map(|(x, y)| Vector::new(x, y, z)))
            .collect();
        let mut indices = Vec::new();
        for i in 0..4 {
            let j = (i + 1) % 4;
            for [a, b, c, d] in [
                [i, i + 4, j + 4, j],
                [i + 8, j + 8, j + 12, i + 12],
                [i, j, j + 8, i + 8],
                [i + 4, i + 12, j + 12, j + 4],
            ] {
                indices.extend([[a, b, c], [a, c, d]]);
            }
        }
        let ring = mesh_part(vertices, indices, DEFAULT_INSET);
        let through_hole = box_part(Vector::ZERO, Vector::new(0.4, 0.4, 4.0));
        assert!(
            overlap(&ring, &through_hole, NUMERICAL_TOLERANCE)
                .unwrap()
                .is_none()
        );
        let in_material = box_part(Vector::new(1.5, 0.0, 0.0), Vector::splat(0.2));
        assert!(
            overlap(&ring, &in_material, NUMERICAL_TOLERANCE)
                .unwrap()
                .is_some()
        );
    }

    #[test]
    fn separates_touching_from_solid_overlap() {
        let first = box_part(Vector::ZERO, Vector::splat(0.5));
        for offset in [
            Vector::X,
            Vector::new(1.0, 1.0, 0.0),
            Vector::ONE,
            Vector::splat(2.0),
        ] {
            let second = box_part(offset, Vector::splat(0.5));
            assert!(
                overlap(&first, &second, DEFAULT_TOLERANCE)
                    .unwrap()
                    .is_none()
            );
        }
        for offset in [
            Vector::ZERO,
            Vector::new(0.5, 0.5, 0.0),
            Vector::new(0.9, 0.0, 0.0),
        ] {
            let second = box_part(offset, Vector::splat(0.5));
            assert!(
                overlap(&first, &second, DEFAULT_TOLERANCE)
                    .unwrap()
                    .is_some()
            );
        }
        let roundoff = box_part(Vector::new(0.99999, 0.0, 0.0), Vector::splat(0.5));
        assert!(
            overlap(&first, &roundoff, DEFAULT_TOLERANCE)
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn detects_containment_and_crossing_without_contained_vertices() {
        let outer = box_part(Vector::ZERO, Vector::ONE);
        let inner = box_part(Vector::ZERO, Vector::splat(0.25));
        assert!(
            overlap(&outer, &inner, DEFAULT_TOLERANCE)
                .unwrap()
                .is_some()
        );
        assert!(
            overlap(&inner, &outer, DEFAULT_TOLERANCE)
                .unwrap()
                .is_some()
        );
        let horizontal = box_part(Vector::ZERO, Vector::new(2.0, 0.25, 0.25));
        let vertical = box_part(Vector::ZERO, Vector::new(0.25, 2.0, 0.25));
        assert!(
            overlap(&horizontal, &vertical, DEFAULT_TOLERANCE)
                .unwrap()
                .is_some()
        );
    }

    #[test]
    fn rejects_open_reversed_and_degenerate_meshes() {
        let (vertices, mut indices) = box_mesh(Vector::ONE);
        indices.pop();
        assert!(shells(vertices.clone(), indices, 0.0).is_err());
        let (_, indices) = box_mesh(Vector::ONE);
        let reversed = indices.iter().map(|&[a, b, c]| [a, c, b]).collect();
        assert!(shells(vertices.clone(), reversed, 0.0).is_err());
        assert!(shells(vertices, vec![[0, 0, 0]], 0.0).is_err());
    }

    #[test]
    fn rejects_invalid_scenes_instead_of_reporting_clear() {
        for xml in [
            "<scene version=\"1\" units=\"inches\" space=\"world\"/>",
            "<scene version=\"2\" units=\"inches\" space=\"world\"/>",
            "<scene version=\"1\" units=\"mm\" space=\"world\"/>",
            "<scene>",
            "<scene version=\"1\" units=\"inches\" space=\"world\"><part id=\"p\" name=\"P\"><vertices>NaN 0 0</vertices><triangles>0 0 0</triangles></part></scene>",
            "<scene version=\"1\" units=\"inches\" space=\"world\"><part id=\"p\" name=\"P\"><vertices>0 0 0</vertices><triangles>0 1 2</triangles></part></scene>",
        ] {
            assert!(parse_scene(xml, DEFAULT_INSET).is_err(), "{xml}");
        }
    }
}
